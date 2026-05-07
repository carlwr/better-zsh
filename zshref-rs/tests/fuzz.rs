//! Property tests for the `zshref` CLI.
//!
//! Filename is `fuzz.rs` for historical reasons (the first wave of cases
//! were smoke-fuzzes asserting "doesn't crash + top-level shape"). The
//! current suite is broader: real invariants like docs round-trips,
//! `--limit` caps, `--category` filter purity, `NO_*` toggle symmetry,
//! `outputSchema` conformance on every tool response, search dedup, score
//! ordering, and per-category total consistency. The name is kept to
//! avoid churning `Cargo.toml`'s `[[test]]` + `CARGO_BIN_EXE_zshref`
//! wiring. See `tests/fuzz.proptest-regressions` for auto-checked-in
//! seeds.
//!
//! Cost budget: each property uses `ProptestConfig::with_cases(16)` so
//! the whole file stays comfortably under ~15s wall-clock.

mod common;

use proptest::prelude::*;
use serde_json::Value;
use std::process::Command;
use std::sync::OnceLock;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

/// Category list discovered from the running binary's own `info` output —
/// the canonical taxonomy (owned by zsh-core / baked into the binary). Using
/// this as the source of truth for property inputs means new categories are
/// automatically covered by `known_category()`-driven properties and the
/// explicit `every_category_*` tests below; no one has to remember to bump
/// a hand-typed constant here.
fn doc_categories() -> &'static [String] {
    static CATS: OnceLock<Vec<String>> = OnceLock::new();
    CATS.get_or_init(|| {
        let v = run_json(&["info"]);
        v.get("categories")
            .and_then(Value::as_array)
            .expect("`zshref info` emits a `categories` array")
            .iter()
            .filter_map(|x| x.as_str().map(str::to_owned))
            .collect()
    })
}

/// Options known to exist in the bundled corpus, used to probe `NO_*` toggle
/// symmetry. Each form must lookup to a stable canonical id across the
/// bare / `NO_` variants; the `NO_` form additionally carries
/// `feedback: { kind: "input-negated" }`.
const KNOWN_OPTIONS: &[&str] = &["AUTOCD", "AUTO_CD", "NOTIFY", "PROMPT_CR", "CORRECT"];

fn run_raw(args: &[&str]) -> std::process::Output {
    Command::new(BIN).args(args).output().expect("spawn zshref")
}

fn run_json(args: &[&str]) -> Value {
    let out = run_raw(args);
    if !out.status.success() {
        panic!(
            "nonzero exit {:?} for args {:?}\nstderr:\n{}",
            out.status.code(),
            args,
            String::from_utf8_lossy(&out.stderr),
        );
    }
    let v: Value = serde_json::from_slice(&out.stdout).expect("stdout is valid JSON");
    // Auto-validate every tool-subcommand response against its bundled
    // `outputSchema`. Wraps the existing property tests transparently —
    // any of the hundreds of randomized invocations becomes a schema
    // conformance check. Subcommands without a schema (`info`,
    // `schema`, `completions`) are passed through.
    if let Some(sub) = args.first() {
        if let Some(tool) = common::tool_for_subcommand(sub) {
            assert_tool_output_shape(args, &out);
            common::validate_or_panic(tool, &v);
        }
    }
    v
}

fn assert_tool_output_shape(args: &[&str], out: &std::process::Output) {
    assert!(
        out.stderr.is_empty(),
        "successful tool subcommand {args:?} wrote stderr:\n{}",
        String::from_utf8_lossy(&out.stderr),
    );
    assert!(
        out.stdout.ends_with(b"\n") && out.stdout.iter().filter(|b| **b == b'\n').count() == 1,
        "default tool output must be one compact JSON line for args {args:?}; stdout:\n{}",
        String::from_utf8_lossy(&out.stdout),
    );
}

/// A small strategy producing zsh keys with a high docs hit-rate.
/// Covers the prompt-listed union (options, builtins, reserved words,
/// redir sigils). Free fuzzing is covered by the smoke tests below.
fn known_raw() -> impl Strategy<Value = &'static str> {
    prop_oneof![
        Just("AUTO_CD"),
        Just("NO_AUTO_CD"),
        Just("echo"),
        Just("[["),
        Just("NOTIFY"),
        Just("<<<"),
        Just("while"),
    ]
}

fn known_category() -> impl Strategy<Value = String> {
    proptest::sample::select(doc_categories().to_vec())
}

fn assert_envelope(v: &Value) -> (&Vec<Value>, u64, u64) {
    let matches = v
        .get("matches")
        .and_then(Value::as_array)
        .expect("`matches` is an array");
    let returned = v
        .get("matchesReturned")
        .and_then(Value::as_u64)
        .expect("`matchesReturned` is u64");
    let total = v
        .get("matchesTotal")
        .and_then(Value::as_u64)
        .expect("`matchesTotal` is u64");
    (matches, returned, total)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(16))]

    // === Smoke fuzz: arbitrary printable input never crashes and ===
    // === always yields the standard envelope.                    ===

    // `\PC` = any printable unicode char; `{0,40}` = 0..=40 chars.
    #[test]
    fn docs_never_crashes(key in r"\PC{0,40}") {
        let v = run_json(&["docs", "--key", &key]);
        let (_, returned, total) = assert_envelope(&v);
        prop_assert_eq!(returned, total, "docs never truncates");
    }

    #[test]
    fn search_never_crashes(q in r"\PC{1,20}") {
        let v = run_json(&["search", "--query", &q, "--limit", "10"]);
        assert_envelope(&v);
    }

    #[test]
    fn list_never_crashes(n in 0u32..=20) {
        let n_s = n.to_string();
        let v = run_json(&["list", "--limit", &n_s]);
        let (matches, returned, _) = assert_envelope(&v);
        prop_assert_eq!(matches.len() as u64, returned);
    }

    // === Stronger invariants ===

    /// docs round-trip: when `docs --category=C --key=ID` resolves, the
    /// returned `id` must equal `ID`. Closed-identity round-trips like
    /// `for` against `complex_command` and `reserved_word` confirm direct-
    /// hit precedence (see DESIGN.md §"docs: direct ∥ resolver"). This
    /// is a property-level companion to the exhaustive
    /// `round-trip.test.ts` in tooldef.
    #[test]
    fn docs_self_roundtrip(key in known_raw()) {
        let v = run_json(&["docs", "--key", key]);
        let (matches, _, _) = assert_envelope(&v);
        for m in matches {
            let cat = m.get("category").and_then(Value::as_str).expect("category");
            let id = m.get("id").and_then(Value::as_str).expect("id");
            // Re-query with `--category` set to the resolved category;
            // direct lookup of the canonical id must round-trip.
            let r = run_json(&["docs", "--key", id, "--category", cat]);
            let (rm, _, _) = assert_envelope(&r);
            prop_assert!(
                !rm.is_empty(),
                "round-trip docs(key={id}, cat={cat}) returned empty after first hit"
            );
            let rid = rm[0].get("id").and_then(Value::as_str);
            prop_assert_eq!(rid, Some(id), "round-trip id mismatch");
        }
    }

    /// `search --limit N`: returned count ≤ N, returned count ≤ total,
    /// and `matches.len()` must equal `matchesReturned`.
    #[test]
    fn search_limit_invariant(q in r"\PC{1,20}", n in 0u32..=20) {
        let n_s = n.to_string();
        let v = run_json(&["search", "--query", &q, "--limit", &n_s]);
        let (matches, returned, total) = assert_envelope(&v);

        prop_assert_eq!(
            matches.len() as u64, returned,
            "matches.len() != matchesReturned"
        );
        prop_assert!(
            returned <= u64::from(n),
            "matchesReturned ({returned}) > limit ({n})"
        );
        prop_assert!(
            returned <= total,
            "matchesReturned ({returned}) > matchesTotal ({total})"
        );
    }

    /// `list --category C`: every returned match has `.category == C`.
    /// Confirms the category filter is a pure pass-through (no leakage
    /// from other categories).
    #[test]
    fn list_category_filter_is_pure(cat in known_category(), n in 1u32..=20) {
        let n_s = n.to_string();
        let v = run_json(&["list", "--category", &cat, "--limit", &n_s]);
        let (matches, _, _) = assert_envelope(&v);
        for (i, m) in matches.iter().enumerate() {
            let got = m.get("category").and_then(Value::as_str);
            prop_assert_eq!(
                got, Some(cat.as_str()),
                "match[{}] category = {:?}, expected {:?}", i, got, cat
            );
        }
    }

    /// NO_-prefix toggle symmetry: for a curated known-option name, both
    /// `X` and `NO_X` must resolve via `docs --category=option` to the same
    /// canonical `id`. The `NO_` form additionally carries
    /// `feedback: { kind: "input-negated" }`; the bare form carries no
    /// `feedback` at all.
    #[test]
    fn docs_option_no_toggle_symmetry(idx in 0usize..KNOWN_OPTIONS.len()) {
        let name = KNOWN_OPTIONS[idx];
        let negated_name = format!("NO_{name}");

        let bare = run_json(&["docs", "--key", name, "--category", "option"]);
        let no = run_json(&["docs", "--key", &negated_name, "--category", "option"]);

        let (bm, _, _) = assert_envelope(&bare);
        let (nm, _, _) = assert_envelope(&no);
        prop_assert!(!bm.is_empty(), "docs option={name} returned empty");
        prop_assert!(!nm.is_empty(), "docs option={negated_name} returned empty");

        let bare_id = bm[0].get("id").and_then(Value::as_str);
        let no_id = nm[0].get("id").and_then(Value::as_str);
        prop_assert_eq!(
            bare_id, no_id,
            "canonical id differs: {:?} vs {:?}", bare_id, no_id
        );

        let bare_kind = bm[0]
            .get("feedback")
            .and_then(|v| v.get("kind"))
            .and_then(Value::as_str);
        let no_kind = nm[0]
            .get("feedback")
            .and_then(|v| v.get("kind"))
            .and_then(Value::as_str);
        prop_assert_eq!(bare_kind, None, "bare `{}` must carry no feedback", name);
        prop_assert_eq!(
            no_kind, Some("input-negated"),
            "`NO_{}` must carry feedback.kind = input-negated", name
        );
    }

    /// Byte-level determinism: two successive `docs` spawns with the
    /// same argv must produce identical stdout. Catches nondeterminism
    /// (hash ordering, time-based fields) that shape-only assertions miss.
    #[test]
    fn docs_is_deterministic(key in known_raw()) {
        let a = run_raw(&["docs", "--key", key]);
        let b = run_raw(&["docs", "--key", key]);
        prop_assert!(a.status.success() && b.status.success());
        prop_assert_eq!(
            &a.stdout, &b.stdout,
            "docs({:?}) stdout differs between runs", key
        );
    }
}

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

/// Per-category record-count consistency: the unfiltered `list --limit 0`
/// reports a `matchesTotal` equal to the sum of every per-category
/// `list --category C --limit 0` total. Catches double-counting,
/// dropped-category bugs, and category-leakage bugs that pure-filter tests
/// miss. Every category must report a non-zero total.
#[test]
fn list_per_category_totals_sum_to_total() {
    let cats = doc_categories();
    let total_v = run_json(&["list", "--limit", "0"]);
    let total = total_v
        .get("matchesTotal")
        .and_then(Value::as_u64)
        .expect("matchesTotal");
    let mut sum: u64 = 0;
    for cat in cats {
        let v = run_json(&["list", "--category", cat, "--limit", "0"]);
        let t = v
            .get("matchesTotal")
            .and_then(Value::as_u64)
            .unwrap_or_else(|| panic!("list --category {cat}: matchesTotal missing"));
        assert!(t > 0, "category {cat}: matchesTotal = 0");
        sum += t;
    }
    assert_eq!(
        sum, total,
        "per-category matchesTotal sum ({sum}) != unfiltered matchesTotal ({total})"
    );
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]

    /// search dedup invariant: no two matches share `(category, id)`.
    /// Companion to the focused TS regression test in
    /// `packages/zsh-core-tooldef/src/test/tools/search.test.ts`,
    /// exercised across many random queries here. The seen-set is the
    /// load-bearing structure that makes the four-tier walk
    /// (exact / resolver / prefix / fuzzy) safe; this catches walk-order
    /// regressions wherever they manifest.
    #[test]
    fn search_dedup_invariant(q in r"\PC{1,20}", n in 1u32..=50) {
        let n_s = n.to_string();
        let v = run_json(&["search", "--query", &q, "--limit", &n_s]);
        let (matches, _, _) = assert_envelope(&v);
        let mut seen = std::collections::HashSet::new();
        for m in matches {
            let cat = m.get("category").and_then(Value::as_str).expect("category");
            let id = m.get("id").and_then(Value::as_str).expect("id");
            let key = (cat.to_string(), id.to_string());
            prop_assert!(
                seen.insert(key),
                "duplicate (category, id)=({cat:?}, {id:?}) in search results for query={q:?}"
            );
        }
    }

    /// search score invariants:
    ///   - every score in `[0, 1]` (matches the schema bound);
    ///   - scores are non-increasing across the result list — top tiers
    ///     all score `1.0`, fuzzy tail strictly below; once a score drops
    ///     below `1.0`, no later score may climb back. Catches
    ///     tier-walk reordering regressions.
    #[test]
    fn search_score_monotone_in_unit_interval(q in r"\PC{1,20}", n in 1u32..=50) {
        let n_s = n.to_string();
        let v = run_json(&["search", "--query", &q, "--limit", &n_s]);
        let (matches, _, _) = assert_envelope(&v);
        let mut prev = f64::INFINITY;
        for m in matches {
            let s = m
                .get("score")
                .and_then(Value::as_f64)
                .expect("score is a number");
            prop_assert!(
                (0.0..=1.0).contains(&s),
                "score {s} not in [0, 1]"
            );
            prop_assert!(
                s <= prev + 1e-9,
                "score {s} > previous {prev} (expected non-increasing across tiers)"
            );
            prev = s;
        }
    }
}
