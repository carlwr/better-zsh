//! `zshref schema` smoke: spawn the binary and assert the bundle parses to
//! the expected shape. No gold master — contents drift with per-tool schemas.

use serde_json::Value;
use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

#[test]
fn schema_subcommand_emits_expected_bundle_shape() {
    let out = Command::new(BIN)
        .arg("schema")
        .output()
        .expect("spawn zshref schema");

    assert!(
        out.status.success(),
        "zshref schema exit {:?}; stderr:\n{}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr),
    );
    assert_eq!(out.status.code(), Some(0));

    let bundle: Value = serde_json::from_slice(&out.stdout).unwrap_or_else(|e| {
        panic!(
            "zshref schema stdout is not valid JSON ({e}):\n{}",
            String::from_utf8_lossy(&out.stdout),
        )
    });

    let obj = bundle
        .as_object()
        .expect("top-level JSON value must be an object");
    assert_eq!(
        obj.get("version").and_then(Value::as_u64),
        Some(1),
        "expected version: 1"
    );

    let tools = obj
        .get("tools")
        .and_then(Value::as_array)
        .expect("tools array");
    assert_eq!(tools.len(), 3, "expected 3 tools, got {}", tools.len());

    for entry in tools {
        let entry = entry.as_object().expect("tool entry must be an object");
        let name = entry
            .get("name")
            .and_then(Value::as_str)
            .expect("tool entry must carry a string `name`");
        for key in ["inputSchema", "outputSchema"] {
            let schema = entry
                .get(key)
                .unwrap_or_else(|| panic!("tool entry must carry `{key}`"));
            let schema_obj = schema
                .as_object()
                .unwrap_or_else(|| panic!("{key} for {name} must be a JSON object"));
            assert!(
                !schema_obj.is_empty(),
                "{key} for {name} must be a non-empty object"
            );
        }
    }
}
