//! Layout/content guards for `--help` output: 80-col fit, Usage shape,
//! Options:-section descriptions, short/long help equivalence.

use regex::Regex;
use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

const SUBCOMMANDS: &[&str] = &[
    "docs",
    "search",
    "list",
    "batch",
    "info",
    "schema",
    "completions",
    "help",
];

fn run(args: &[&str], env: &[(&str, &str)]) -> std::process::Output {
    let mut cmd = Command::new(BIN);
    cmd.args(args);
    cmd.env_remove("NO_COLOR");
    cmd.env_remove("CLICOLOR_FORCE");
    cmd.env_remove("COLUMNS");
    for (k, v) in env {
        cmd.env(k, v);
    }
    cmd.output()
        .unwrap_or_else(|e| panic!("spawn zshref {args:?}: {e}"))
}

fn stdout_utf8(args: &[&str], env: &[(&str, &str)]) -> String {
    let out = run(args, env);
    assert!(
        out.status.success(),
        "zshref {args:?} exit {:?}",
        out.status
    );
    String::from_utf8(out.stdout).expect("stdout is utf-8")
}

#[test]
fn subcommand_usage_lines_never_bracket_required_flags() {
    // Required options must be unbracketed in `Usage:`. Catches a regression
    // where clap would render `[--key <KEY>]` for a required flag.
    let must_be_unbracketed: &[(&str, &[&str])] = &[
        ("docs", &["--key"]),
        ("search", &["--query"]),
        ("completions", &["<SHELL>"]),
    ];

    for (sub, required) in must_be_unbracketed {
        let help = stdout_utf8(&[sub, "--help"], &[("NO_COLOR", "1")]);
        let usage = help
            .lines()
            .find(|l| l.starts_with("Usage:"))
            .unwrap_or_else(|| panic!("zshref {sub} --help has no Usage: line:\n{help}"));
        for token in *required {
            let bracketed = format!("[{token}");
            assert!(
                !usage.contains(&bracketed),
                "zshref {sub} --help: required `{token}` appears bracketed in Usage:\n{usage}"
            );
            assert!(
                usage.contains(token),
                "zshref {sub} --help: required `{token}` missing from Usage:\n{usage}"
            );
        }
    }
}

#[test]
fn help_fits_at_eighty_columns() {
    // Generous threshold: guards runaway prose, not normal growth. clap's
    // wrap_help honors $COLUMNS even on non-tty stdout.
    let mut targets: Vec<Vec<&str>> = vec![vec!["--help"], vec!["-h"]];
    for sub in SUBCOMMANDS {
        targets.push(vec![*sub, "--help"]);
        targets.push(vec![*sub, "-h"]);
    }

    for args in &targets {
        let help = stdout_utf8(args, &[("NO_COLOR", "1"), ("COLUMNS", "80")]);
        let too_long = help
            .lines()
            .filter(|l| l.chars().count() > 80)
            .collect::<Vec<_>>();
        assert!(
            too_long.is_empty(),
            "zshref {args:?} has lines >80 cols at COLUMNS=80:\n{}\nfull help:\n{help}",
            too_long.join("\n"),
        );
    }
}

#[test]
fn root_help_has_examples_section() {
    let help = stdout_utf8(&["--help"], &[("NO_COLOR", "1")]);
    assert!(
        help.contains("\nExamples:\n"),
        "root --help is missing Examples section:\n{help}"
    );
}

#[test]
fn help_invocations_are_equivalent() {
    // The three help-request forms must produce byte-identical output:
    //   root:    `zshref help`        ≡ `zshref --help`        ≡ `zshref -h`
    //   sub:     `zshref help SUBCMD` ≡ `zshref SUBCMD --help` ≡ `zshref SUBCMD -h`
    // `help` routes through `cli::render_help`; `-h`/`--help` share clap's
    // `HelpLong` action. Drift here usually means one path lost styling,
    // prose, or footer text.
    let mut groups: Vec<[Vec<&str>; 3]> = vec![[vec!["help"], vec!["--help"], vec!["-h"]]];
    for sub in SUBCOMMANDS {
        groups.push([vec!["help", *sub], vec![*sub, "--help"], vec![*sub, "-h"]]);
    }
    for forms in &groups {
        let outs: Vec<(&[&str], String)> = forms
            .iter()
            .map(|args| {
                let slice: &[&str] = args;
                (slice, stdout_utf8(slice, &[("NO_COLOR", "1")]))
            })
            .collect();
        let (ref_args, ref_out) = &outs[0];
        for (other_args, other_out) in &outs[1..] {
            assert_eq!(
                ref_out, other_out,
                "zshref {other_args:?} differs from zshref {ref_args:?} — help invocations must produce identical output",
            );
        }
    }
}

#[test]
fn option_descriptions_are_phrase_form() {
    // Briefs are phrases, not sentences: lowercase first letter, no trailing
    // period.
    let mut violations: Vec<String> = Vec::new();
    for sub in SUBCOMMANDS {
        let help = stdout_utf8(&[sub, "--help"], &[("NO_COLOR", "1")]);
        for (flag, desc) in option_descriptions(&help) {
            check_phrase(sub, &flag, &desc, &mut violations);
        }
    }
    let help = stdout_utf8(&["--help"], &[("NO_COLOR", "1")]);
    for (flag, desc) in option_descriptions(&help) {
        check_phrase("(root)", &flag, &desc, &mut violations);
    }
    assert!(
        violations.is_empty(),
        "option-description phrase-form violations:\n  - {}",
        violations.join("\n  - "),
    );
}

fn check_phrase(scope: &str, flag: &str, desc: &str, out: &mut Vec<String>) {
    if desc.chars().next().is_some_and(|c| c.is_uppercase()) {
        out.push(format!("{scope} {flag}: starts with capital: {desc:?}"));
    }
    if desc.trim_end().ends_with('.') {
        out.push(format!("{scope} {flag}: ends with period: {desc:?}"));
    }
}

/// `(flag-tokens, first-description-line)` per option entry inside `Options:`.
/// The two patterns below describe clap's compact and long-form layouts in
/// terms of what the entry looks like, not exact column counts.
fn option_descriptions(help: &str) -> Vec<(String, String)> {
    let options_block = match help.split_once("\nOptions:\n") {
        Some((_, rest)) => rest.split("\n\n\n").next().unwrap_or(rest),
        None => return Vec::new(),
    };

    // Compact: "  -h, --help  print help" — flag, then >=2 spaces, then desc.
    let compact = Regex::new(r"(?m)^\s+(-\S[^\s]*(?:,\s+--\S+)?(?:\s+<\w+>)?)\s{2,}(\S.*)$")
        .expect("compact option regex");
    // Long header: option line with no inline description.
    let long_header = Regex::new(r"(?m)^\s+(-\S[^\s]*(?:,\s+--\S+)?(?:\s+<\w+>)?)\s*$")
        .expect("long header regex");
    // Long-form description: indented further than the option header (clap
    // uses 10 leading spaces in practice; ">=8" leaves headroom for variants).
    let long_desc = Regex::new(r"(?m)^\s{8,}(\S.*)$").expect("long desc regex");

    let mut out: Vec<(String, String)> = Vec::new();
    for cap in compact.captures_iter(options_block) {
        out.push((flag_token(&cap[1]), cap[2].trim().to_string()));
    }
    for cap in long_header.captures_iter(options_block) {
        let header_match = cap.get(0).expect("regex match has group 0");
        let after = &options_block[header_match.end()..];
        if let Some(desc) = long_desc.captures(after).and_then(|c| c.get(1)) {
            out.push((flag_token(&cap[1]), desc.as_str().trim().to_string()));
        }
    }
    out
}

fn flag_token(s: &str) -> String {
    s.split(',').next().unwrap_or("").trim().to_string()
}

#[test]
fn json_subcommand_long_help_is_non_empty() {
    // Tool subcommands need a long body so users get more than just Usage.
    for sub in ["docs", "search", "list", "batch", "schema"] {
        let help = stdout_utf8(&[sub, "--help"], &[("NO_COLOR", "1")]);
        let after_options = help
            .split_once("Options:")
            .map(|(_, tail)| tail)
            .unwrap_or_else(|| panic!("zshref {sub} --help has no Options section:\n{help}"));
        let body = after_options
            .lines()
            .skip_while(|l| l.is_empty() || l.starts_with(' '))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(
            body.split_whitespace().count() > 5,
            "zshref {sub} --help: long body is too short:\nbody:\n{body}"
        );
    }
}
