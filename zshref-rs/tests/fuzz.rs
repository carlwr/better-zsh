//! Property-test smoke-fuzz: arbitrary printable input must never crash
//! the CLI and must always yield valid JSON with the expected top-level
//! shape. Catches surprise-input regressions (unicode, long strings,
//! adversarial whitespace) that the hand-curated fixture set can't cover.
//!
//! Cost: ~100 process spawns at 32 cases per property, typically a few
//! seconds total. Runs in the default `cargo test` suite.

use proptest::prelude::*;
use serde_json::Value;
use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

fn run_json(args: &[&str]) -> Value {
    let out = Command::new(BIN).args(args).output().expect("spawn zshref");
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

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]

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
}
