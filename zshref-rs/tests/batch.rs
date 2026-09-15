//! `zshref batch` wire-contract smoke tests.

use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

/// One request's response, parsed.
fn batch(req: &str) -> Value {
    let stdout = batch_stdout(&[req]);
    serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("zshref batch stdout is not valid JSON ({e}):\n{stdout}"))
}

/// Raw stdout for a sequence of requests; in-band errors leave stderr empty.
fn batch_stdout(reqs: &[&str]) -> String {
    let mut child = Command::new(BIN)
        .arg("batch")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn zshref batch");

    let mut stdin = child.stdin.take().expect("batch stdin");
    for req in reqs {
        writeln!(stdin, "{req}").expect("write batch request");
    }
    drop(stdin);

    let out = child.wait_with_output().expect("wait for zshref batch");
    assert!(
        out.status.success(),
        "zshref batch exit {:?}; stderr:\n{}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr),
    );
    assert!(
        out.stderr.is_empty(),
        "zshref batch should not write stderr on in-band errors:\n{}",
        String::from_utf8_lossy(&out.stderr),
    );
    String::from_utf8(out.stdout).expect("batch stdout is utf-8")
}

/// Decode failures are `ok:false` responses whose `error` carries the
/// serde fragment.
#[test]
fn invalid_input_is_an_in_band_error() {
    let cases = [
        (
            r#"{"tool":"zsh_docs","input":{"key":null}}"#,
            "invalid type: null",
        ),
        (
            r#"{"tool":"zsh_list","input":{"limit":null}}"#,
            "invalid type: null",
        ),
        (
            r#"{"tool":"zsh_search","input":{"query":"echo","extra":1}}"#,
            "unknown field `extra`",
        ),
        (
            r#"{"tool":"zsh_list","input":{"category":"bogus"}}"#,
            "unknown category `bogus`",
        ),
    ];
    for (req, fragment) in cases {
        let resp = batch(req);
        assert_eq!(resp["ok"], false, "{req}: {resp}");
        let error = resp["error"].as_str().expect("error string");
        assert!(error.contains(fragment), "{req}: {error}");
    }
}

#[test]
fn null_category_equals_no_category() {
    let stdout = batch_stdout(&[
        r#"{"tool":"zsh_list","input":{"category":null,"limit":3}}"#,
        r#"{"tool":"zsh_list","input":{"limit":3}}"#,
    ]);
    let lines: Vec<&str> = stdout.lines().collect();
    assert_eq!(lines.len(), 2, "{stdout}");
    assert!(lines[0].starts_with(r#"{"ok":true"#), "{stdout}");
    assert_eq!(lines[0], lines[1]);
}

#[test]
fn emits_one_compact_json_line_per_request() {
    let stdout = batch_stdout(&[
        r#"{"tool":"zsh_docs","input":{"key":"echo"}}"#,
        r#"{"tool":"zsh_docs","input":{"key":null}}"#,
    ]);
    let lines = stdout.lines().collect::<Vec<_>>();
    assert_eq!(lines.len(), 2, "expected two JSONL responses:\n{stdout}");
    for line in lines {
        assert!(
            serde_json::from_str::<Value>(line).is_ok(),
            "batch response line is not JSON: {line}",
        );
    }
}
