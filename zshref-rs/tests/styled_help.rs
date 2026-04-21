//! Regression: `--help` must emit ANSI styling (bold/underline etc.) when
//! color is forced. A previous refactor silently stripped ANSI in the
//! stderr-write path, leaving plaintext help. We can't easily run a PTY
//! from `cargo test`, so we use `CLICOLOR_FORCE=1` — the industry convention
//! `anstream` already honors — to bypass TTY detection.

use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

fn help_stderr(env: &[(&str, &str)]) -> Vec<u8> {
    let mut cmd = Command::new(BIN);
    cmd.arg("--help");
    // Start from a clean slate for the env vars we care about, then apply overrides.
    cmd.env_remove("NO_COLOR");
    cmd.env_remove("CLICOLOR_FORCE");
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd.output().expect("spawn zshref --help");
    assert!(out.status.success(), "zshref --help exit: {:?}", out.status);
    out.stderr
}

#[test]
fn help_contains_ansi_when_color_forced() {
    let bytes = help_stderr(&[("CLICOLOR_FORCE", "1")]);
    assert!(
        bytes.windows(2).any(|w| w == b"\x1b["),
        "CLICOLOR_FORCE=1 --help should contain ANSI escape(s) but did not — \
         styled help regressed; inspect src/output.rs::write_to_stderr"
    );
}

#[test]
fn help_is_plain_when_no_color_set() {
    let bytes = help_stderr(&[("CLICOLOR_FORCE", "1"), ("NO_COLOR", "1")]);
    assert!(
        !bytes.windows(2).any(|w| w == b"\x1b["),
        "NO_COLOR must override CLICOLOR_FORCE: saw ANSI in --help stderr"
    );
}
