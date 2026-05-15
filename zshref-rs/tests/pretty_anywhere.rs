//! `--pretty` is universally a valid request:
//!
//!   * On JSON-emitting subcommands (docs / search / list / schema, plus
//!     `info` which is always pretty), passing `--pretty` produces indented
//!     output regardless of whether the flag sits before or after the
//!     subcommand.
//!   * On subcommands where pretty is meaningless (`batch`, `help`,
//!     `completions`), passing `--pretty` must be silently accepted as
//!     a no-op rather than rejected.
//!
//! Single matrix test pinning the invariant — the small added parse-time
//! surface from `BuildMode::Parsing` (hidden `--pretty` on no-op subs) is
//! what makes this rule hold; this test is the guard against regression.
//!
//! Differential tab-completion offers (only docs/search/list/schema) come
//! from `BuildMode::Completions`. Completions are intentionally not
//! integration-tested per project policy.

use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

#[derive(Clone, Copy)]
enum Position {
    Root,    // zshref --pretty <sub> ...
    Sub,     // zshref <sub> ... --pretty
    Both,    // zshref --pretty <sub> ... --pretty
    Neither, // zshref <sub> ...
}

impl Position {
    fn all() -> &'static [Position] {
        &[Self::Root, Self::Sub, Self::Both, Self::Neither]
    }

    fn label(self) -> &'static str {
        match self {
            Self::Root => "root",
            Self::Sub => "sub",
            Self::Both => "both",
            Self::Neither => "neither",
        }
    }
}

fn build_args(pos: Position, sub: &str, tail: &[&str]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if matches!(pos, Position::Root | Position::Both) {
        out.push("--pretty".into());
    }
    out.push(sub.into());
    for t in tail {
        out.push((*t).into());
    }
    if matches!(pos, Position::Sub | Position::Both) {
        out.push("--pretty".into());
    }
    out
}

fn run(args: &[String]) -> std::process::Output {
    Command::new(BIN)
        .args(args)
        .output()
        .unwrap_or_else(|e| panic!("spawn zshref {args:?}: {e}"))
}

/// JSON-emitting subcommands: pretty must round-trip in every position.
/// `info` is always-pretty regardless of the flag, but the parse must still
/// succeed in every position.
const PRETTY_SUBS: &[(&str, &[&str])] = &[
    ("docs", &["--key=AUTO_CD"]),
    ("search", &["--query=AUTO_CD", "--limit=1"]),
    ("list", &["--limit=1"]),
    ("schema", &[]),
    ("info", &[]),
];

/// No-op subcommands: parse must succeed in every position; we don't
/// assert anything about stdout shape (varies per subcommand).
const NOOP_SUBS: &[(&str, &[&str])] = &[
    ("batch", &[]),            // empty stdin → empty stdout, exit 0
    ("help", &[]),             // root help
    ("help", &["docs"]),       // help for a specific subcommand
    ("completions", &["zsh"]), // emits a shell script
];

#[test]
fn pretty_is_valid_in_any_position_on_json_emitting_subs() {
    for (sub, tail) in PRETTY_SUBS {
        for pos in Position::all() {
            let args = build_args(*pos, sub, tail);
            let out = run(&args);
            assert!(
                out.status.success(),
                "zshref {args:?} ({sub}, pos={}) failed with {:?}; stderr:\n{}",
                pos.label(),
                out.status.code(),
                String::from_utf8_lossy(&out.stderr),
            );
            // Whenever --pretty was passed (in any position), OR the
            // subcommand is always-pretty, stdout should be indented JSON.
            // `info` is always-pretty; the others switch on the flag.
            let pretty_requested = matches!(pos, Position::Root | Position::Sub | Position::Both);
            let always_pretty = *sub == "info";
            let expect_pretty = pretty_requested || always_pretty;
            let stdout = String::from_utf8(out.stdout).expect("stdout utf-8");
            if expect_pretty {
                assert!(
                    stdout.starts_with("{\n  "),
                    "expected indented JSON for {args:?} (pos={}); got:\n{stdout}",
                    pos.label(),
                );
            } else {
                assert!(
                    stdout.starts_with('{') && !stdout.starts_with("{\n"),
                    "expected compact JSON for {args:?} (pos={}); got:\n{stdout}",
                    pos.label(),
                );
            }
        }
    }
}

#[test]
fn pretty_is_silent_noop_on_non_json_subs() {
    for (sub, tail) in NOOP_SUBS {
        for pos in Position::all() {
            let args = build_args(*pos, sub, tail);
            let out = run(&args);
            assert!(
                out.status.success(),
                "zshref {args:?} ({sub}, pos={}) failed with {:?}; stderr:\n{}",
                pos.label(),
                out.status.code(),
                String::from_utf8_lossy(&out.stderr),
            );
            // "silent" is load-bearing: hidden no-op `--pretty` must not
            // surface a warning, deprecation, or any diagnostic.
            assert!(
                out.stderr.is_empty(),
                "`--pretty` on no-op sub {sub:?} (pos={}) wrote stderr:\n{}",
                pos.label(),
                String::from_utf8_lossy(&out.stderr),
            );
        }
    }
}
