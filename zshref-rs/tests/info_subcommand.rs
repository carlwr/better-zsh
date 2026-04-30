//! `zshref info` output shape.

use serde_json::Value;
use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

#[test]
fn info_is_pretty_printed_by_default() {
    let out = Command::new(BIN)
        .arg("info")
        .output()
        .expect("spawn zshref info");
    assert!(
        out.status.success(),
        "zshref info exit {:?}; stderr:\n{}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr),
    );

    let stdout = String::from_utf8(out.stdout).expect("info stdout is utf-8");
    assert!(
        stdout.contains("\n  \"packageVersion\":"),
        "info output was not pretty-printed:\n{stdout}"
    );

    let v: Value = serde_json::from_str(&stdout).expect("info stdout is valid JSON");
    assert!(v.is_object(), "info output should be a JSON object");
}
