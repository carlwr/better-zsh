//! Regression: explicit help/version output belongs on stdout and must keep
//! ANSI styling (bold/underline etc.) when color is forced. We can't easily
//! run a PTY from `cargo test`, so we use `CLICOLOR_FORCE=1` to bypass TTY
//! detection.

use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

fn explicit_output(args: &[&str], env: &[(&str, &str)]) -> (Vec<u8>, Vec<u8>) {
    let mut cmd = Command::new(BIN);
    cmd.args(args);
    // Start from a clean slate for the env vars we care about, then apply overrides.
    cmd.env_remove("NO_COLOR");
    cmd.env_remove("CLICOLOR_FORCE");
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd.output().expect("spawn zshref");
    assert!(
        out.status.success(),
        "zshref {args:?} exit: {:?}",
        out.status
    );
    (out.stdout, out.stderr)
}

fn explicit_stdout(args: &[&str], env: &[(&str, &str)]) -> Vec<u8> {
    let (stdout, stderr) = explicit_output(args, env);
    assert!(
        stderr.is_empty(),
        "zshref {args:?} wrote stderr:\n{}",
        String::from_utf8_lossy(&stderr)
    );
    stdout
}

fn bad_input_stderr(args: &[&str]) -> (Vec<u8>, Vec<u8>) {
    bad_input_stderr_with_env(args, &[])
}

fn bad_input_stderr_with_env(args: &[&str], env: &[(&str, &str)]) -> (Vec<u8>, Vec<u8>) {
    let mut cmd = Command::new(BIN);
    cmd.args(args);
    cmd.env_remove("NO_COLOR");
    cmd.env_remove("CLICOLOR_FORCE");
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd
        .output()
        .unwrap_or_else(|e| panic!("spawn zshref {args:?}: {e}"));
    assert_eq!(
        out.status.code(),
        Some(2),
        "zshref {args:?} should be bad input"
    );
    (out.stdout, out.stderr)
}

fn has_ansi(bytes: &[u8]) -> bool {
    bytes.windows(2).any(|w| w == b"\x1b[")
}

#[test]
fn explicit_help_and_version_use_stdout() {
    for args in [
        &[][..],
        &["--help"],
        &["-h"],
        &["--version"],
        &["-V"],
        &["help"],
        &["help", "docs"],
        &["help", "search"],
        &["help", "list"],
        &["help", "batch"],
        &["help", "info"],
        &["help", "schema"],
        &["help", "completions"],
        &["docs", "--help"],
        &["docs", "-h"],
        &["search", "--help"],
        &["list", "--help"],
        &["batch", "--help"],
        &["info", "--help"],
        &["schema", "--help"],
        &["completions", "--help"],
    ] {
        let stdout = explicit_stdout(args, &[("NO_COLOR", "1")]);
        assert!(
            !stdout.is_empty(),
            "zshref {args:?} should write help/version stdout"
        );
    }
}

#[test]
fn bad_input_routes_to_stderr_with_exit_2() {
    // Covers: unknown subcommand, unknown flag, missing required, missing
    // positional, bad enum. Bare invocation (`&[]`) is NOT here — it is an
    // implicit help request (stdout + exit 0); see CLI-POLICY.md.
    let cases: &[&[&str]] = &[
        &["nope"],
        &["--bogus"],
        &["docs"],
        &["docs", "--bogus"],
        &["docs", "--key=AUTO_CD", "--category=not_a_category"],
        &["search"],
        &["completions"],
        &["help", "nope"],
    ];
    for args in cases {
        let (stdout, stderr) = bad_input_stderr(args);
        assert!(
            stdout.is_empty(),
            "zshref {args:?}: bad-input must not write stdout:\n{}",
            String::from_utf8_lossy(&stdout),
        );
        assert!(
            !stderr.is_empty(),
            "zshref {args:?}: bad-input must write stderr",
        );
    }
}

#[test]
fn bare_invocation_emits_full_help_to_stdout() {
    // CLI-POLICY.md: bare invocation is an implicit help request. Output
    // is byte-identical to `--help` so all `--help` invariants apply for free.
    let bare = explicit_stdout(&[], &[("NO_COLOR", "1")]);
    let explicit = explicit_stdout(&["--help"], &[("NO_COLOR", "1")]);
    assert_eq!(
        bare, explicit,
        "bare `zshref` must emit the same stdout as `zshref --help`",
    );
}

#[test]
fn help_contains_ansi_when_color_forced() {
    let bytes = explicit_stdout(&["--help"], &[("CLICOLOR_FORCE", "1")]);
    assert!(
        has_ansi(&bytes),
        "CLICOLOR_FORCE=1 --help should contain ANSI escape(s) but did not — \
         styled help regressed; inspect src/output.rs::write_to_stdout"
    );
}

#[test]
fn help_is_plain_when_stdout_is_not_tty() {
    let bytes = explicit_stdout(&["--help"], &[]);
    assert!(
        !has_ansi(&bytes),
        "piped --help stdout must not contain ANSI"
    );
}

#[test]
fn clicolor_force_zero_does_not_force_ansi() {
    let bytes = explicit_stdout(&["--help"], &[("CLICOLOR_FORCE", "0")]);
    assert!(
        !has_ansi(&bytes),
        "CLICOLOR_FORCE=0 must not force ANSI in --help stdout"
    );
}

#[test]
fn no_color_overrides_forced_color() {
    let bytes = explicit_stdout(&["--help"], &[("CLICOLOR_FORCE", "1"), ("NO_COLOR", "1")]);
    assert!(
        !has_ansi(&bytes),
        "NO_COLOR must override CLICOLOR_FORCE: saw ANSI in --help stdout"
    );
}

#[test]
fn bad_input_color_policy_matches_stderr() {
    let (_, forced) = bad_input_stderr_with_env(&["not-a-command"], &[("CLICOLOR_FORCE", "1")]);
    assert!(
        has_ansi(&forced),
        "CLICOLOR_FORCE=1 bad-input stderr should contain ANSI"
    );

    let (_, no_color) = bad_input_stderr_with_env(
        &["not-a-command"],
        &[("CLICOLOR_FORCE", "1"), ("NO_COLOR", "1")],
    );
    assert!(
        !has_ansi(&no_color),
        "NO_COLOR must override CLICOLOR_FORCE for bad-input stderr"
    );
}

#[test]
fn help_renders_suite_preamble_with_rewritten_tool_names() {
    // The shared tool-suite preamble is MCP-tone prose (references `zsh_*`
    // tool names); `prose::rewrite_refs()` rewrites those to `zshref *` at render.
    // Asserts both: (a) the preamble reached the CLI help output,
    // (b) the rewrite actually ran (no stray `zsh_search` etc. in help).
    let help = String::from_utf8(explicit_stdout(&["--help"], &[])).expect("help is utf-8");
    assert!(
        help.contains("Tool \u{2192} intent:"),
        "preamble missing from --help output:\n{help}"
    );
    assert!(
        help.contains("zshref search"),
        "prose::rewrite_refs() did not produce `zshref search` in --help:\n{help}"
    );
    for raw in ["zsh_docs", "zsh_search", "zsh_list"] {
        assert!(
            !help.contains(raw),
            "raw MCP tool name `{raw}` leaked through into --help:\n{help}"
        );
    }
}

#[test]
fn root_help_documents_color_environment_and_pretty_default() {
    let root = String::from_utf8(explicit_stdout(&["--help"], &[])).expect("help is utf-8");
    assert!(
        root.contains("NO_COLOR"),
        "root --help must document NO_COLOR"
    );
    assert!(
        root.contains("CLICOLOR_FORCE"),
        "root --help must document CLICOLOR_FORCE"
    );
    assert!(
        root.contains("--pretty"),
        "root --help must advertise --pretty in Options:\n{root}"
    );

    for sub in ["docs", "search", "list", "schema"] {
        let help =
            String::from_utf8(explicit_stdout(&[sub, "--help"], &[])).expect("help is utf-8");
        // Case-insensitive per CLI-POLICY.md ("Testing discipline").
        assert!(
            help.to_lowercase().contains("default: compact json"),
            "zshref {sub} --help must state the --pretty default:\n{help}"
        );
    }
}

#[test]
fn root_position_pretty_is_accepted_before_subcommand() {
    for sub in ["docs", "search", "list", "schema"] {
        let out = Command::new(BIN)
            .args(["--pretty", sub])
            .args(match sub {
                "docs" => vec!["--key=AUTO_CD"],
                "search" => vec!["--query=AUTO_CD", "--limit=1"],
                "list" => vec!["--limit=1"],
                "schema" => vec![],
                _ => unreachable!("covered by loop cases"),
            })
            .output()
            .unwrap_or_else(|e| panic!("spawn zshref --pretty {sub}: {e}"));
        assert!(
            out.status.success(),
            "zshref --pretty {sub} failed with {:?}; stderr:\n{}",
            out.status.code(),
            String::from_utf8_lossy(&out.stderr),
        );
        let stdout = String::from_utf8(out.stdout).expect("stdout is utf-8");
        assert!(
            stdout.starts_with("{\n  "),
            "zshref --pretty {sub} should pretty-print JSON:\n{stdout}"
        );
    }
}

#[test]
fn help_flag_description_is_plain() {
    for args in [
        &["--help"][..],
        &["docs", "--help"],
        &["search", "--help"],
        &["list", "--help"],
        &["batch", "--help"],
        &["info", "--help"],
        &["schema", "--help"],
        &["completions", "--help"],
        &["help", "--help"],
    ] {
        let help = String::from_utf8(explicit_stdout(args, &[])).expect("help is utf-8");
        assert!(
            help.to_lowercase().contains("print help"),
            "zshref {args:?} should describe -h/--help:\n{help}"
        );
        assert!(
            !help.contains("see more") && !help.contains("see a summary"),
            "zshref {args:?} should not show clap's split short/long help hint:\n{help}"
        );
    }
}

#[test]
fn json_subcommand_help_orders_pretty_last() {
    for (sub, ordered) in [
        ("docs", vec!["--key", "--category", "--pretty"]),
        (
            "search",
            vec!["--query", "--category", "--limit", "--pretty"],
        ),
        ("list", vec!["--category", "--limit", "--pretty"]),
    ] {
        let help =
            String::from_utf8(explicit_stdout(&[sub, "--help"], &[])).expect("help is utf-8");
        let options = help
            .split_once("Options:")
            .map(|(_, tail)| tail)
            .unwrap_or_else(|| panic!("zshref {sub} --help missing Options section:\n{help}"));
        let mut last = 0;
        for flag in ordered {
            let pos = options
                .find(flag)
                .unwrap_or_else(|| panic!("zshref {sub} --help missing {flag}:\n{help}"));
            assert!(
                pos > last,
                "zshref {sub} --help option order drifted around {flag}:\n{help}"
            );
            last = pos;
        }
    }
}

#[test]
fn help_omits_removed_mangen_subcommand() {
    let help = String::from_utf8(explicit_stdout(&["--help"], &[])).expect("help is utf-8");
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
