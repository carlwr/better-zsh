//! CLI-facing category validation.

use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

#[test]
fn invalid_category_is_bad_input() {
    let cases: &[&[&str]] = &[
        &["docs", "--key=AUTO_CD", "--category=not_a_category"],
        &["search", "--query=AUTO_CD", "--category=not_a_category"],
        &["list", "--category=not_a_category"],
    ];

    for args in cases {
        let out = Command::new(BIN)
            .args(*args)
            .output()
            .expect("spawn zshref");
        assert_eq!(
            out.status.code(),
            Some(2),
            "expected bad-input exit for args {args:?}; stderr:\n{}",
            String::from_utf8_lossy(&out.stderr),
        );
        assert!(
            out.stdout.is_empty(),
            "bad category should not write stdout for args {args:?}; stdout:\n{}",
            String::from_utf8_lossy(&out.stdout),
        );
        let stderr = String::from_utf8_lossy(&out.stderr);
        assert!(
            stderr.contains("invalid value") && stderr.contains("possible values"),
            "expected clap enum error for args {args:?}; stderr:\n{stderr}",
        );
    }
}

fn stdout(args: &[&str]) -> String {
    let out = Command::new(BIN)
        .args(args)
        .env("NO_COLOR", "1")
        .output()
        .unwrap_or_else(|e| panic!("spawn zshref {args:?}: {e}"));
    assert!(
        out.status.success(),
        "zshref {args:?} failed ({:?}); stderr:\n{}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr),
    );
    String::from_utf8(out.stdout).expect("stdout is utf-8")
}

#[test]
fn root_help_documents_category_in_options() {
    // `--category` lives on the tool subcommands; root `--help` documents it
    // in `Options:` (alongside `--pretty`), with the valid-values table — the
    // top-level surface where readers look first.
    let help = stdout(&["--help"]);
    let options = help
        .split_once("\nOptions:\n")
        .map(|(_, tail)| tail)
        .unwrap_or_else(|| panic!("root --help has no Options section:\n{help}"));
    assert!(
        options.contains("--category"),
        "root --help Options must document --category:\n{help}"
    );
    // A couple of categories from the rendered list — guards that the
    // valid-values table reached the root option, not just the flag name.
    for cat in ["conditional_op", "glob_qualifier"] {
        assert!(
            options.contains(cat),
            "root --help --category must list `{cat}`:\n{help}"
        );
    }
}

#[test]
fn root_position_category_forwards_to_subcommand() {
    // `zshref --category=C docs …` applies like `zshref docs … --category=C`
    // (mirrors root-position `--pretty`). `!` overlaps several categories, so
    // narrowing to `conditional_op` must yield exactly that one match.
    let out = stdout(&["--category=conditional_op", "docs", "--key=!"]);
    let v: serde_json::Value = serde_json::from_str(&out).expect("docs output is json");
    let matches = v["matches"].as_array().expect("matches array");
    assert_eq!(
        matches.len(),
        1,
        "root-position --category should narrow to one match:\n{out}"
    );
    assert_eq!(matches[0]["category"], "conditional_op");

    // Sub-position wins when both are given.
    let out = stdout(&[
        "--category=builtin",
        "docs",
        "--key=!",
        "--category=conditional_op",
    ]);
    let v: serde_json::Value = serde_json::from_str(&out).expect("docs output is json");
    assert_eq!(
        v["matches"][0]["category"], "conditional_op",
        "sub-position --category must override root-position:\n{out}"
    );
}
