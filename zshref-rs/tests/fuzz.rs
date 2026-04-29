//! Property tests for the `zshref` CLI.
//!
//! Filename is `fuzz.rs` for historical reasons (the first wave of cases
//! were smoke-fuzzes asserting "doesn't crash + top-level shape"). The
//! current suite is broader: real invariants like docs round-trips,
//! `--limit` caps, `--category` filter purity, `NO_*` toggle symmetry,
//! and output determinism. The name is kept to avoid churning
//! `Cargo.toml`'s `[[test]]` + `CARGO_BIN_EXE_zshref` wiring. See
//! `tests/fuzz.proptest-regressions` for auto-checked-in seeds.
//!
//! Cost budget: each property uses `ProptestConfig::with_cases(16)` so the
//! whole file stays comfortably under ~15s wall-clock.

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

/// A small strategy producing raw tokens with a high docs hit-rate.
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
    fn docs_never_crashes(raw in r"\PC{0,40}") {
        let v = run_json(&["docs", "--raw", &raw]);
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

    /// docs round-trip: when `docs --category=C --raw=ID` resolves, the
    /// returned `id` must equal `ID`. Closed-identity round-trips like
    /// `for` against `complex_command` and `reserved_word` confirm direct-
    /// hit precedence (see DESIGN.md §"docs: direct ∥ resolver"). This
    /// is a property-level companion to the exhaustive
    /// `round-trip.test.ts` in tooldef.
    #[test]
    fn docs_self_roundtrip(raw in known_raw()) {
        let v = run_json(&["docs", "--raw", raw]);
        let (matches, _, _) = assert_envelope(&v);
        for m in matches {
            let cat = m.get("category").and_then(Value::as_str).expect("category");
            let id = m.get("id").and_then(Value::as_str).expect("id");
            // Re-query with `--category` set to the resolved category;
            // direct lookup of the canonical id must round-trip.
            let r = run_json(&["docs", "--raw", id, "--category", cat]);
            let (rm, _, _) = assert_envelope(&r);
            prop_assert!(
                !rm.is_empty(),
                "round-trip docs(raw={id}, cat={cat}) returned empty after first hit"
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
    /// canonical `id`, with `negated` flipping between the two forms.
    #[test]
    fn docs_option_no_toggle_symmetry(idx in 0usize..KNOWN_OPTIONS.len()) {
        let name = KNOWN_OPTIONS[idx];
        let negated_name = format!("NO_{name}");

        let bare = run_json(&["docs", "--raw", name, "--category", "option"]);
        let no = run_json(&["docs", "--raw", &negated_name, "--category", "option"]);

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

        let bare_neg = bm[0].get("negated").and_then(Value::as_bool);
        let no_neg = nm[0].get("negated").and_then(Value::as_bool);
        prop_assert_eq!(bare_neg, Some(false), "bare `{}` should be negated=false", name);
        prop_assert_eq!(no_neg, Some(true), "`NO_{}` should be negated=true", name);
    }

    /// Byte-level determinism: two successive `docs` spawns with the
    /// same argv must produce identical stdout. Catches nondeterminism
    /// (hash ordering, time-based fields) that shape-only assertions miss.
    #[test]
    fn docs_is_deterministic(raw in known_raw()) {
        let a = run_raw(&["docs", "--raw", raw]);
        let b = run_raw(&["docs", "--raw", raw]);
        prop_assert!(a.status.success() && b.status.success());
        prop_assert_eq!(
            &a.stdout, &b.stdout,
            "docs({:?}) stdout differs between runs", raw
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
