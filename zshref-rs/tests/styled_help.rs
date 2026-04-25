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

#[test]
fn help_renders_suite_preamble_with_rewritten_tool_names() {
    // The shared tool-suite preamble is MCP-tone prose (references `zsh_*`
    // tool names); `cli_prose()` rewrites those to `zshref *` at render.
    // Asserts both: (a) the preamble reached the CLI help output,
    // (b) the rewrite actually ran (no stray `zsh_search` etc. in help).
    let help = String::from_utf8(help_stderr(&[])).expect("help is utf-8");
    assert!(
        help.contains("Intent"),
        "preamble missing from --help output:\n{help}"
    );
    assert!(
        help.contains("zshref search"),
        "cli_prose() rewrite did not produce `zshref search` in --help:\n{help}"
    );
    for raw in ["zsh_docs", "zsh_search", "zsh_list"] {
        assert!(
            !help.contains(raw),
            "raw MCP tool name `{raw}` leaked through into --help:\n{help}"
        );
    }
}

#[test]
fn help_omits_removed_mangen_subcommand() {
    let help = String::from_utf8(help_stderr(&[])).expect("help is utf-8");
    assert!(
        !help.contains("mangen"),
        "root --help still mentions removed `mangen` subcommand:\n{help}"
    );

    let out = Command::new(BIN)
        .arg("mangen")
        .output()
        .expect("spawn zshref mangen");
    assert_eq!(out.status.code(), Some(2), "removed subcommand should fail");

    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        stderr.contains("subcommand") && stderr.contains("mangen"),
        "expected clap unknown-subcommand error, got:\n{stderr}"
    );
}
