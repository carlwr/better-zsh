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
