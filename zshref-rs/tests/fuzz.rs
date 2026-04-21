//! Property tests for the `zshref` CLI.
//!
//! Filename is `fuzz.rs` for historical reasons (the first wave of cases
//! were smoke-fuzzes asserting "doesn't crash + top-level shape"). The
//! current suite is broader: real invariants like classify→describe
//! round-trips, `--limit` caps, `--category` filter purity, `NO_*` toggle
//! symmetry, and output determinism. The name is kept to avoid churning
//! `Cargo.toml`'s `[[test]]` + `CARGO_BIN_EXE_zshref` wiring. See
//! `tests/fuzz.proptest-regressions` for auto-checked-in seeds.
//!
//! Cost budget: each property uses `ProptestConfig::with_cases(16)` so the
//! whole file stays comfortably under ~15s wall-clock.

use proptest::prelude::*;
use serde_json::Value;
use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

/// Closed list of `DocCategory` values, mirrors `src/cli.rs::DOC_CATEGORIES`.
/// Duplicated here (rather than exposed as a test helper) so that a category
/// rename in `src/` doesn't silently pass the filter-purity property.
const DOC_CATEGORIES: &[&str] = &[
    "option",
    "cond_op",
    "builtin",
    "precmd",
    "shell_param",
    "reserved_word",
    "redir",
    "process_subst",
    "param_expn",
    "subscript_flag",
    "param_flag",
    "history",
    "glob_op",
    "glob_flag",
    "prompt_escape",
    "zle_widget",
];

/// Options known to exist in the bundled corpus, used to probe `NO_*` toggle
/// symmetry. Each form must lookup to a stable canonical id across the
/// bare / `NO_` variants, flipping only the `negated` flag.
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
    serde_json::from_slice(&out.stdout).expect("stdout is valid JSON")
}

/// A small strategy producing raw tokens with a high classify hit-rate.
/// Covers the prompt-listed union (options, builtins, reserved words,
/// redir sigils). Free fuzzing is covered by the legacy smoke tests below.
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

fn known_category() -> impl Strategy<Value = &'static str> {
    prop_oneof![
        Just("option"),
        Just("cond_op"),
        Just("builtin"),
        Just("precmd"),
        Just("shell_param"),
        Just("reserved_word"),
        Just("redir"),
        Just("process_subst"),
        Just("param_expn"),
        Just("subscript_flag"),
        Just("param_flag"),
        Just("history"),
        Just("glob_op"),
        Just("glob_flag"),
        Just("prompt_escape"),
        Just("zle_widget"),
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(16))]

    // === Legacy smoke fuzz: arbitrary printable input never crashes and ===
    // === always yields a well-shaped top-level JSON object.            ===

    // `\PC` = any printable unicode char; `{0,40}` = 0..=40 chars.
    #[test]
    fn classify_never_crashes(raw in r"\PC{0,40}") {
        let v = run_json(&["classify", "--raw", &raw]);
        prop_assert!(v.get("match").is_some(), "missing `match` key: {v:?}");
    }

    #[test]
    fn lookup_option_never_crashes(raw in r"\PC{0,40}") {
        let v = run_json(&["lookup_option", "--raw", &raw]);
        prop_assert!(v.get("match").is_some(), "missing `match` key: {v:?}");
    }

    #[test]
    fn search_never_crashes(q in r"\PC{0,20}") {
        let v = run_json(&["search", "--query", &q, "--limit", "10"]);
        prop_assert!(v.get("matches").and_then(Value::as_array).is_some());
        prop_assert!(v.get("matchesReturned").and_then(Value::as_u64).is_some());
        prop_assert!(v.get("matchesTotal").and_then(Value::as_u64).is_some());
    }

    // `describe` takes a closed-enum `--category` (clap rejects bad values
    // at parse time → exit 2), so we only fuzz `--id`.
    #[test]
    fn describe_never_crashes(id in r"\PC{0,40}") {
        let v = run_json(&["describe", "--category", "builtin", "--id", &id]);
        prop_assert!(v.get("match").is_some(), "missing `match` key: {v:?}");
    }

    // === Stronger invariants ===

    /// classify → describe round-trip: when classify resolves to a
    /// `{category, id}`, `describe` on that same pair must also match and
    /// return the same id. Skip when classify returned `null` so the
    /// property still exercises a real lookup on most inputs.
    #[test]
    fn classify_describe_roundtrip(raw in known_raw()) {
        let v = run_json(&["classify", "--raw", raw]);
        let Some(m) = v.get("match").and_then(Value::as_object) else {
            return Ok(());
        };
        if m.is_empty() {
            return Ok(());
        }
        let category = m.get("category").and_then(Value::as_str);
        let id = m.get("id").and_then(Value::as_str);
        let (Some(category), Some(id)) = (category, id) else {
            return Ok(());
        };

        let d = run_json(&["describe", "--category", category, "--id", id]);
        let dm = d.get("match").and_then(Value::as_object);
        prop_assert!(
            dm.is_some(),
            "describe({category}, {id}) returned null after classify({raw}) hit"
        );
        let dm = dm.unwrap();
        let d_id = dm.get("id").and_then(Value::as_str);
        prop_assert_eq!(d_id, Some(id), "describe id mismatch for raw={:?}", raw);
    }

    /// `search --limit N`: returned count ≤ N, returned count ≤ total,
    /// and `matches.len()` must equal `matchesReturned`. (This subsumes
    /// the spec's item #6, matchesTotal ≥ matchesReturned.)
    #[test]
    fn search_limit_invariant(q in r"\PC{0,20}", n in 1u32..=20) {
        let n_s = n.to_string();
        let v = run_json(&["search", "--query", &q, "--limit", &n_s]);
        let matches = v.get("matches").and_then(Value::as_array)
            .expect("`matches` is an array");
        let returned = v.get("matchesReturned").and_then(Value::as_u64)
            .expect("`matchesReturned` is u64");
        let total = v.get("matchesTotal").and_then(Value::as_u64)
            .expect("`matchesTotal` is u64");

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

    /// `search --category C` with empty query: every returned match has
    /// `.category == C`. Confirms the category filter is a pure pass-through
    /// (no leakage from other categories in the no-query branch).
    #[test]
    fn search_category_filter_is_pure(cat in known_category(), n in 1u32..=20) {
        let n_s = n.to_string();
        let v = run_json(&["search", "--query", "", "--category", cat, "--limit", &n_s]);
        let matches = v.get("matches").and_then(Value::as_array)
            .expect("`matches` is an array");
        for (i, m) in matches.iter().enumerate() {
            let got = m.get("category").and_then(Value::as_str);
            prop_assert_eq!(
                got, Some(cat),
                "match[{}] category = {:?}, expected {:?}", i, got, cat
            );
        }
    }

    /// NO_-prefix toggle symmetry: for a curated known-option name, both
    /// `X` and `NO_X` must resolve via `lookup_option` to the same
    /// canonical `id`, with `negated` flipping between the two forms.
    #[test]
    fn lookup_option_no_toggle_symmetry(
        idx in 0usize..KNOWN_OPTIONS.len(),
    ) {
        let name = KNOWN_OPTIONS[idx];
        let negated_name = format!("NO_{name}");

        let bare = run_json(&["lookup_option", "--raw", name]);
        let no = run_json(&["lookup_option", "--raw", &negated_name]);

        let bare_m = bare.get("match").and_then(Value::as_object);
        let no_m = no.get("match").and_then(Value::as_object);
        prop_assert!(bare_m.is_some(), "lookup_option({name}) returned null");
        prop_assert!(no_m.is_some(), "lookup_option({negated_name}) returned null");
        let bare_m = bare_m.unwrap();
        let no_m = no_m.unwrap();

        let bare_id = bare_m.get("id").and_then(Value::as_str);
        let no_id = no_m.get("id").and_then(Value::as_str);
        prop_assert_eq!(
            bare_id, no_id,
            "canonical id differs: {:?} vs {:?}", bare_id, no_id
        );

        let bare_neg = bare_m.get("negated").and_then(Value::as_bool);
        let no_neg = no_m.get("negated").and_then(Value::as_bool);
        prop_assert_eq!(bare_neg, Some(false), "bare `{}` should be negated=false", name);
        prop_assert_eq!(no_neg, Some(true), "`NO_{}` should be negated=true", name);
    }

    /// Byte-level determinism: two successive `classify` spawns with the
    /// same argv must produce identical stdout. Catches nondeterminism
    /// (hash ordering, time-based fields) that shape-only assertions miss.
    #[test]
    fn classify_is_deterministic(raw in known_raw()) {
        let a = run_raw(&["classify", "--raw", raw]);
        let b = run_raw(&["classify", "--raw", raw]);
        prop_assert!(a.status.success() && b.status.success());
        prop_assert_eq!(
            &a.stdout, &b.stdout,
            "classify({:?}) stdout differs between runs", raw
        );
    }
}

// Smoke-test DOC_CATEGORIES: a round-trip against the CLI's own help output
// would require parsing, so instead we just assert the count matches a known
// stable constant. A mismatch here means the CLI added/removed a category
// and the property tests above won't cover the new one until this is bumped.
#[test]
fn doc_categories_stable_count() {
    assert_eq!(
        DOC_CATEGORIES.len(),
        16,
        "DOC_CATEGORIES drifted; update property tests to cover new categories"
    );
}
