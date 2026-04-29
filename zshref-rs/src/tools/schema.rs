//! `zshref schema` — emit `{ version, tools: [{name, inputSchema, outputSchema}] }`.
//!
//! For codegen / programmatic validation; not for human reading.
//! Input schemas also define the wire contract for `zshref batch`.
//! `--help` long-about advertises size to discourage piping into agent context.

use crate::corpus::ToolDefs;
use anyhow::Result;
use serde_json::{json, Value};
use std::sync::OnceLock;

pub fn run(tool_defs: &ToolDefs) -> Result<Value> {
    Ok(build_bundle(tool_defs))
}

fn build_bundle(tool_defs: &ToolDefs) -> Value {
    let tools: Vec<Value> = tool_defs
        .tools
        .iter()
        .map(|td| {
            json!({
                "name": td.name,
                "inputSchema": td.input_schema,
                "outputSchema": td.output_schema,
            })
        })
        .collect();
    // `version` from `tooldef.json` envelope — no Rust-side constant to drift.
    json!({
        "version": tool_defs.version,
        "tools": tools,
    })
}

/// Word + leaf counts (lazily computed). Word count over pretty-printed form
/// — upper bound for `--pretty`, slight over-estimate for compact default.
pub fn size_hint(tool_defs: &ToolDefs) -> (usize, usize) {
    static CACHE: OnceLock<(usize, usize)> = OnceLock::new();
    *CACHE.get_or_init(|| {
        let bundle = build_bundle(tool_defs);
        let words = serde_json::to_string_pretty(&bundle)
            .map(|s| s.split_whitespace().count())
            .unwrap_or(0);
        let leaves = count_leaves(&bundle);
        (words, leaves)
    })
}

/// Non-container node count (object values only, not keys).
fn count_leaves(v: &Value) -> usize {
    match v {
        Value::Object(map) => map.values().map(count_leaves).sum(),
        Value::Array(arr) => arr.iter().map(count_leaves).sum(),
        _ => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::load_tool_defs;

    #[test]
    fn bundle_has_expected_top_level_keys() {
        let defs = load_tool_defs().expect("load_tool_defs");
        let v = run(&defs).expect("schema::run");
        let obj = v.as_object().expect("top-level object");
        assert_eq!(obj.get("version").and_then(Value::as_u64), Some(1));
        assert!(obj.contains_key("tools"));
    }

    #[test]
    fn bundle_lists_three_tools_with_input_and_output_schema() {
        let defs = load_tool_defs().expect("load_tool_defs");
        let v = run(&defs).expect("schema::run");
        let tools = v["tools"].as_array().expect("tools array");
        assert_eq!(tools.len(), 3, "expected 3 tools, got {}", tools.len());
        for entry in tools {
            let entry = entry.as_object().expect("tool entry object");
            assert!(entry.contains_key("name"));
            for key in ["inputSchema", "outputSchema"] {
                let schema = entry
                    .get(key)
                    .unwrap_or_else(|| panic!("missing {key} on tool entry"));
                assert!(schema.is_object(), "{key} must be a JSON object");
                assert!(
                    !schema.as_object().unwrap().is_empty(),
                    "{key} must not be empty"
                );
            }
        }
    }

    #[test]
    fn count_leaves_walks_arrays_and_objects() {
        let v = json!({"a": 1, "b": [2, 3, {"c": "x"}], "d": null});
        // 1 (a=1) + 2 (2,3) + 1 (c="x") + 1 (d=null) = 5
        assert_eq!(count_leaves(&v), 5);
    }
}
