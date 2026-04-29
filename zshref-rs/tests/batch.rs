//! `zshref batch` wire-contract smoke tests.

use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

fn batch(req: &str) -> Value {
    let mut child = Command::new(BIN)
        .arg("batch")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn zshref batch");

    let mut stdin = child.stdin.take().expect("batch stdin");
    stdin
        .write_all(format!("{req}\n").as_bytes())
        .expect("write batch request");
    drop(stdin);

    let out = child.wait_with_output().expect("wait for zshref batch");
    assert!(
        out.status.success(),
        "zshref batch exit {:?}; stderr:\n{}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr),
    );

    serde_json::from_slice(&out.stdout).unwrap_or_else(|e| {
        panic!(
            "zshref batch stdout is not valid JSON ({e}):\n{}",
            String::from_utf8_lossy(&out.stdout),
        )
    })
}

#[test]
fn rejects_null_required_string() {
    let resp = batch(r#"{"tool":"zsh_docs","input":{"raw":null}}"#);
    assert_eq!(resp.get("ok").and_then(Value::as_bool), Some(false));
    assert!(
        resp.get("error")
            .and_then(Value::as_str)
            .is_some_and(|e| e.contains("`raw` must be a string")),
        "unexpected response: {resp}",
    );
}

#[test]
fn rejects_null_optional_integer() {
    let resp = batch(r#"{"tool":"zsh_list","input":{"limit":null}}"#);
    assert_eq!(resp.get("ok").and_then(Value::as_bool), Some(false));
    assert!(
        resp.get("error")
            .and_then(Value::as_str)
            .is_some_and(|e| e.contains("`limit` must be an integer")),
        "unexpected response: {resp}",
    );
}

#[test]
fn rejects_unknown_input_field() {
    let resp = batch(r#"{"tool":"zsh_search","input":{"query":"echo","extra":1}}"#);
    assert_eq!(resp.get("ok").and_then(Value::as_bool), Some(false));
    assert!(
        resp.get("error")
            .and_then(Value::as_str)
            .is_some_and(|e| e.contains("unknown field: `extra`")),
        "unexpected response: {resp}",
    );
}
