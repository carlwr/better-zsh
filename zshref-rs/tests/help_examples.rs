use std::process::Command;

mod common;

use common::{run_with_env, BIN};

#[test]
fn tool_help_examples_match_cli_output() {
    for sub in ["docs", "search", "list"] {
        let help = help_for(sub);
        let examples = common::extract_examples(&help);
        assert!(
            !examples.is_empty(),
            "zshref {sub} --help: no/bad Example block:\n{help}"
        );
        for (command, shown_output) in examples {
            let actual = run_example_command(command.clone());
            // `docs` examples elide long `mdBody` strings to keep the
            // help block within 80 cols (a real `mdBody` would force clap
            // to wrap inside a JSON string and break syntax). Normalize
            // `mdBody` to a sentinel on both sides — drift detection
            // stays on every other field; `mdBody` content is verified
            // separately by the docs renderer tests.
            assert_eq!(
                normalize_mdbody(&shown_output),
                normalize_mdbody(&actual),
                "`zshref {sub} --help` example drifted from real CLI output \
                 (command: {command})"
            );
        }
    }
}

#[test]
fn root_workflow_examples_match_cli_output() {
    let help = no_color_stdout(&["--help"]);
    let examples = common::extract_examples_under(&help, &["Typical workflow:"]);
    assert_eq!(
        examples.len(),
        2,
        "expected 2 workflow steps (search → docs), found {}:\n{help}",
        examples.len(),
    );
    for (command, shown_output) in examples {
        let actual = run_example_command(command.clone());
        // The workflow's `docs` step picks a record with a short
        // `mdBody` so no elision fires; `normalize_mdbody` is still safe
        // (it's a no-op when `mdBody` matches between sides).
        assert_eq!(
            normalize_mdbody(&shown_output),
            normalize_mdbody(&actual),
            "`zshref --help` workflow example drifted from real CLI output \
             (command: {command})"
        );
    }
}

/// Parse `s` as pretty-printed JSON and replace every `mdBody` value with
/// a fixed sentinel, then re-serialize. Returns `s` unchanged if parsing
/// fails (helps surface accidental clap reflow inside a JSON string as
/// an unequal-strings assertion rather than a panic).
fn normalize_mdbody(s: &str) -> String {
    let Ok(mut v) = serde_json::from_str::<serde_json::Value>(s.trim()) else {
        return s.to_string();
    };
    replace_mdbody(&mut v);
    serde_json::to_string_pretty(&v).unwrap_or_else(|_| s.to_string())
}

fn replace_mdbody(v: &mut serde_json::Value) {
    use serde_json::Value;
    match v {
        Value::Object(m) => {
            for (k, val) in m.iter_mut() {
                if k == "mdBody" {
                    *val = Value::String("<test-normalized>".into());
                } else {
                    replace_mdbody(val);
                }
            }
        }
        Value::Array(a) => a.iter_mut().for_each(replace_mdbody),
        _ => {}
    }
}

fn no_color_stdout(args: &[&str]) -> String {
    let out = run_with_env(args, &[("NO_COLOR", "1")]);
    assert!(
        out.stderr.is_empty(),
        "zshref {args:?} wrote stderr:\n{}",
        String::from_utf8_lossy(&out.stderr),
    );
    String::from_utf8(out.stdout).expect("stdout is utf-8")
}

fn help_for(sub: &str) -> String {
    no_color_stdout(&[sub, "--help"])
}

fn extract_or_panic(help: &str, sub: &str) -> (String, String) {
    common::extract_example(help)
        .unwrap_or_else(|| panic!("zshref {sub} --help: no/bad Example block:\n{help}"))
}

#[test]
fn batch_help_example_matches_real_output() {
    let help = help_for("batch");
    let (command, shown_output) = extract_or_panic(&help, "batch");
    let request = parse_batch_pipeline(&command);
    let actual = run_batch_request(&request);
    assert_eq!(
        shown_output, actual,
        "`zshref batch --help` example drifted from real CLI output"
    );
}

fn parse_batch_pipeline(command: &str) -> String {
    let suffix = " | zshref batch | jq";
    let head = command
        .strip_suffix(suffix)
        .unwrap_or_else(|| panic!("batch example must end with `{suffix}`: {command:?}"));
    let request = head
        .strip_prefix("echo '")
        .and_then(|s| s.strip_suffix('\''))
        .unwrap_or_else(|| {
            panic!("batch example must wrap request in `echo '<json>'`: {command:?}")
        });
    request.to_string()
}

fn run_batch_request(request: &str) -> String {
    use std::io::Write;
    use std::process::Stdio;
    let mut child = Command::new(BIN)
        .arg("batch")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("NO_COLOR", "1")
        .spawn()
        .expect("spawn zshref batch");
    // Stdin write on its own thread so wait_with_output can drain stdout
    // concurrently — see src/batch.rs:5 for the rationale.
    let mut stdin_h = child.stdin.take().expect("stdin piped");
    let payload = format!("{request}\n");
    let writer = std::thread::spawn(move || {
        stdin_h
            .write_all(payload.as_bytes())
            .expect("write batch stdin");
    });
    let out = child.wait_with_output().expect("wait batch");
    writer.join().expect("stdin writer panicked");
    assert!(out.status.success(), "zshref batch failed: {out:?}");
    assert!(
        out.stderr.is_empty(),
        "zshref batch wrote stderr:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let raw = String::from_utf8(out.stdout).expect("batch stdout is utf-8");
    // Re-pretty-print each batch line with the same `to_string_pretty`
    // formatter used in `cli/prose.rs::batch_example`. We're not mimicking
    // `jq` byte-for-byte (jq's spacing differs in places); we're checking
    // that the prose-side rendering matches a round-trip through batch.
    // Avoids a hard dependency on a `jq` binary in CI.
    let mut formatted = String::new();
    for line in raw.lines() {
        if line.is_empty() {
            continue;
        }
        let v: serde_json::Value = serde_json::from_str(line).expect("batch response line is json");
        formatted.push_str(&serde_json::to_string_pretty(&v).expect("re-pretty serializes"));
        formatted.push('\n');
    }
    formatted
}

fn run_example_command(command: String) -> String {
    let parts = shell_split(&command);
    assert_eq!(
        parts.first().map(String::as_str),
        Some("zshref"),
        "example command must start with `zshref `: {command}"
    );
    let args: Vec<&str> = parts[1..].iter().map(String::as_str).collect();
    no_color_stdout(&args)
}

/// Minimal shell-style splitter: spaces split args, single-quoted spans
/// are taken literally with the quotes stripped. Enough for example
/// commands like `--key='(.)'`; not a full POSIX shell parser.
fn shell_split(s: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut has_content = false;
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        match c {
            ' ' => {
                if has_content {
                    args.push(std::mem::take(&mut current));
                    has_content = false;
                }
            }
            '\'' => {
                has_content = true;
                for inner in chars.by_ref() {
                    if inner == '\'' {
                        break;
                    }
                    current.push(inner);
                }
            }
            _ => {
                current.push(c);
                has_content = true;
            }
        }
    }
    if has_content {
        args.push(current);
    }
    args
}
