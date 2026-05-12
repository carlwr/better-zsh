//! Deterministic invariant checks for the `zshref` CLI: every-category
//! sweeps, CLI ↔ batch parity, schema-default round-trips, and a full
//! corpus round-trip. Pairs with the proptest sampling in
//! `tests/properties.rs` by guaranteeing fixed coverage where random
//! sampling could miss a newly added category, tool, or record.

mod common;

use common::{doc_categories, locate_tooldef_json, run_json, validate_or_panic, BIN};
use serde_json::{json, Value};
use std::process::Command;
use std::sync::OnceLock;

/// Deterministic sweep across every `doc_categories()` entry. Pairs with
/// the property tests (which sample random categories and may miss a newly
/// added one within their `with_cases` budget) by guaranteeing each category
/// is exercised at least once per run: `list --category C` must return
/// records that all carry `category == C`, and the category must contain
/// at least one record (no empty taxonomy entries).
///
/// Adding a new category to zsh-core → tooldef → the baked corpus
/// automatically extends this sweep; no test code change is needed. If a
/// new category ships without records (or leaks records from another
/// category), this test fails.
#[test]
fn every_category_list_is_pure_and_nonempty() {
    let cats = doc_categories();
    assert!(!cats.is_empty(), "`zshref info` returned no categories");
    for cat in cats {
        let v = run_json(&["list", "--category", cat, "--limit", "5"]);
        let matches = v
            .get("matches")
            .and_then(Value::as_array)
            .unwrap_or_else(|| panic!("list missing `matches` array for {cat}"));
        assert!(
            !matches.is_empty(),
            "category {cat}: empty match set — either no records or filter drift"
        );
        for (i, m) in matches.iter().enumerate() {
            let got = m.get("category").and_then(Value::as_str);
            assert_eq!(
                got,
                Some(cat.as_str()),
                "category {cat}: match[{i}] category leaked = {got:?}"
            );
        }
    }
}

/// For every (tool, flag-with-default) pair: omitting the flag must
/// produce the same CLI output as passing the flag set to the schema
/// default. Pins the `inputSchema.default` → clap `default_value`
/// contract in `src/cli.rs`. New flags-with-defaults are covered
/// automatically; extend `viable_args` only if a new tool gains its
/// first such flag.
#[test]
fn omit_equals_schema_default() {
    let mut checked = 0;
    for tool in tooldef_tools() {
        let name = tool.get("name").and_then(Value::as_str).expect("tool.name");
        let sub = name.strip_prefix("zsh_").unwrap_or(name);
        let Some(props) = tool
            .get("inputSchema")
            .and_then(|s| s.get("properties"))
            .and_then(Value::as_object)
        else {
            continue;
        };
        for (flag, spec) in props {
            let Some(default) = spec.get("default") else {
                continue;
            };
            let baseline = viable_args(sub);
            let with_default = format!("--{flag}={}", render_default(default));
            let mut explicit: Vec<&str> = baseline.to_vec();
            explicit.push(&with_default);

            let v_omit = run_json(baseline);
            let v_expl = run_json(&explicit);
            // Guard against vacuous pass (both branches empty).
            let total = v_omit
                .get("matchesTotal")
                .and_then(Value::as_u64)
                .expect("matchesTotal");
            assert!(total > 0, "vacuous baseline {baseline:?}: matchesTotal=0");
            assert_eq!(
                v_omit, v_expl,
                "tool {name:?} --{flag}: omit != explicit default"
            );
            checked += 1;
        }
    }
    assert!(checked > 0, "no (tool, flag-with-default) pairs exercised");
}

/// Minimum args yielding a non-empty result for a subcommand. `AUTO_CD`
/// is a `KNOWN_OPTIONS` member, so the search exact-tier always hits.
fn viable_args(sub: &str) -> &'static [&'static str] {
    match sub {
        "list" => &["list"],
        "search" => &["search", "--query=AUTO_CD"],
        _ => panic!("no viable baseline for {sub:?}"),
    }
}

fn render_default(v: &Value) -> String {
    match v {
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        _ => panic!("unhandled default type: {v}"),
    }
}

/// Per-category record counts agree across three vantage points: each
/// `list --category C --limit 0` total equals `info.counts.C`, the sum
/// equals the unfiltered `list --limit 0` total, and no category is empty.
/// Catches drift between the two count paths (`info` recomputes from the
/// corpus; `list` counts after filter), plus double-counting / leakage.
#[test]
fn list_per_category_totals_sum_to_total() {
    let info_counts = run_json(&["info"]);
    let info_counts = info_counts
        .get("counts")
        .and_then(Value::as_object)
        .expect("info.counts");
    let total = run_json(&["list", "--limit", "0"])
        .get("matchesTotal")
        .and_then(Value::as_u64)
        .expect("matchesTotal");
    let mut sum: u64 = 0;
    for cat in doc_categories() {
        let t = run_json(&["list", "--category", cat, "--limit", "0"])
            .get("matchesTotal")
            .and_then(Value::as_u64)
            .unwrap_or_else(|| panic!("list --category {cat}: matchesTotal missing"));
        let i = info_counts
            .get(cat)
            .and_then(Value::as_u64)
            .unwrap_or_else(|| panic!("info.counts missing {cat}"));
        assert!(t > 0, "category {cat}: matchesTotal = 0");
        assert_eq!(
            t, i,
            "category {cat}: list total ({t}) != info.counts ({i})"
        );
        sum += t;
    }
    assert_eq!(
        sum, total,
        "per-category sum ({sum}) != unfiltered total ({total})"
    );
}

/// CLI and `batch` entry points must produce identical output for the
/// same logical input. Pins parity of default-injection, input parsing,
/// and dispatch wiring between `src/cli.rs` and `src/batch.rs` — both
/// inject `inputSchema.default` for omitted flags, by different means.
#[test]
fn cli_equals_batch() {
    let cases: &[(&str, &[&str], Value)] = &[
        (
            "zsh_docs",
            &["docs", "--key", "AUTO_CD"],
            json!({"key": "AUTO_CD"}),
        ),
        ("zsh_list", &["list"], json!({})),
        (
            "zsh_search",
            &["search", "--query", "AUTO_CD"],
            json!({"query": "AUTO_CD"}),
        ),
    ];
    for (tool, args, input) in cases {
        let cli = run_json(args);
        let mut batch = run_batch(&[json!({ "tool": tool, "input": input })]);
        assert_eq!(batch.len(), 1);
        assert_eq!(cli, batch.remove(0), "{tool}: cli != batch");
    }
}

/// Every (category, id) in the bundled corpus must round-trip through
/// `docs --category C --key ID`. Generalizes `docs_self_roundtrip` from
/// a 7-key option list to all categories without hand-typed inputs;
/// runs as one `batch` invocation to keep the cost flat.
#[test]
fn docs_roundtrip_over_corpus() {
    let recs = all_records();
    let reqs: Vec<Value> = recs
        .iter()
        .map(|(cat, id)| {
            json!({
                "tool": "zsh_docs",
                "input": { "key": id, "category": cat },
            })
        })
        .collect();
    let outs = run_batch(&reqs);
    assert_eq!(
        outs.len(),
        recs.len(),
        "batch returned {} responses for {} requests",
        outs.len(),
        recs.len()
    );
    for (out, (cat, id)) in outs.iter().zip(recs) {
        validate_or_panic("zsh_docs", out);
        let matches = out
            .get("matches")
            .and_then(Value::as_array)
            .expect("matches");
        assert!(!matches.is_empty(), "docs({cat}, {id}) returned empty");
        let rid = matches[0].get("id").and_then(Value::as_str);
        assert_eq!(
            rid,
            Some(id.as_str()),
            "round-trip id mismatch for ({cat}, {id})"
        );
    }
}

/// `tools` array from the bundled tooldef.json. Cached.
fn tooldef_tools() -> &'static [Value] {
    static TOOLS: OnceLock<Vec<Value>> = OnceLock::new();
    TOOLS.get_or_init(|| {
        let path = locate_tooldef_json();
        let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
        let defs: Value = serde_json::from_slice(&bytes)
            .unwrap_or_else(|e| panic!("parse {}: {e}", path.display()));
        defs.get("tools")
            .and_then(Value::as_array)
            .expect("tools array")
            .clone()
    })
}

/// Every `(category, id)` in the corpus, fetched once via a single
/// unfiltered `list` call sized to the corpus total.
fn all_records() -> &'static [(String, String)] {
    static RECS: OnceLock<Vec<(String, String)>> = OnceLock::new();
    RECS.get_or_init(|| {
        let total = run_json(&["info"])
            .get("counts")
            .and_then(Value::as_object)
            .expect("info.counts")
            .values()
            .filter_map(Value::as_u64)
            .sum::<u64>();
        let v = run_json(&["list", "--limit", &total.to_string()]);
        let matches = v.get("matches").and_then(Value::as_array).expect("matches");
        matches
            .iter()
            .map(|m| {
                let cat = m
                    .get("category")
                    .and_then(Value::as_str)
                    .expect("category")
                    .to_string();
                let id = m.get("id").and_then(Value::as_str).expect("id").to_string();
                (cat, id)
            })
            .collect()
    })
}

/// Pipe `requests` (one JSON object per element) into `zshref batch` and
/// return the unwrapped `output` value from each `{ok: true, output}`
/// response. Panics on any non-`ok` response or nonzero batch exit.
fn run_batch(requests: &[Value]) -> Vec<Value> {
    use std::io::Write;
    use std::process::Stdio;

    let stdin: String = requests
        .iter()
        .map(Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    let mut child = Command::new(BIN)
        .arg("batch")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn zshref batch");
    // Write stdin on its own thread; `wait_with_output` drains stdout/stderr
    // concurrently. Without this split the parent can block writing stdin
    // while the child blocks writing stdout (~1MB out vs ~64KB pipe buffer).
    let mut stdin_h = child.stdin.take().expect("stdin piped");
    let writer = std::thread::spawn(move || {
        stdin_h
            .write_all(stdin.as_bytes())
            .expect("write batch stdin");
    });
    let out = child.wait_with_output().expect("wait batch");
    writer.join().expect("stdin writer panicked");
    assert!(
        out.status.success(),
        "batch exit {:?}\nstderr:\n{}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr),
    );
    out.stdout
        .split(|b| *b == b'\n')
        .filter(|l| !l.is_empty())
        .map(|l| {
            let v: Value = serde_json::from_slice(l).expect("batch line is JSON");
            assert_eq!(
                v.get("ok"),
                Some(&Value::Bool(true)),
                "batch response not ok: {v}"
            );
            v.get("output")
                .cloned()
                .expect("batch response missing `output`")
        })
        .collect()
}
