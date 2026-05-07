//! Drift guard: `scripts/dump-help --print-tools` must match the tool
//! subcommand set the zshref binary actually exposes.

use serde_json::Value;
use std::path::PathBuf;
use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

fn dump_help_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("scripts/dump-help")
}

fn script_tools() -> Vec<String> {
    let out = Command::new(dump_help_script())
        .arg("--print-tools")
        .output()
        .expect("spawn dump-help --print-tools");
    assert!(
        out.status.success(),
        "dump-help --print-tools exit {:?}; stderr:\n{}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr),
    );
    String::from_utf8(out.stdout)
        .expect("--print-tools utf-8")
        .lines()
        .map(str::to_owned)
        .collect()
}

fn binary_tools() -> Vec<String> {
    let out = Command::new(BIN)
        .arg("schema")
        .output()
        .expect("spawn zshref schema");
    assert!(out.status.success(), "zshref schema exit {:?}", out.status);
    let bundle: Value = serde_json::from_slice(&out.stdout).expect("schema is JSON");
    bundle
        .get("tools")
        .and_then(Value::as_array)
        .expect("tools array")
        .iter()
        .map(|t| {
            let name = t
                .get("name")
                .and_then(Value::as_str)
                .expect("tool name string");
            name.strip_prefix("zsh_").unwrap_or(name).to_string()
        })
        .collect()
}

#[test]
fn print_tools_matches_binary_tool_set() {
    assert_eq!(
        script_tools(),
        binary_tools(),
        "dump-help --print-tools drifted from `zshref schema` tool list"
    );
}
