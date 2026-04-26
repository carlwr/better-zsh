//! `zshref schema` — emit JSON bundle of every tool's `outputSchema`.
//!
//! Intended for codegen / programmatic validation, not human reading. The
//! `--help` long-about advertises the size so agents don't pipe the bundle
//! into their context unintentionally; for documentation use the
//! tool-specific `--help` and shell completions instead.
//!
//! Bundle shape (camelCase to match every other JSON the CLI emits):
//! ```json
//! { "version": 1,
//!   "tools": [ { "name": "zsh_docs",   "outputSchema": <…> },
//!              { "name": "zsh_search", "outputSchema": <…> },
//!              { "name": "zsh_list",   "outputSchema": <…> } ] }
//! ```
//! `version` mirrors `tooldef.json`'s envelope versioning so consumers can
//! detect schema-format changes.

use crate::corpus::ToolDefs;
use anyhow::Result;
use serde_json::{json, Value};
use std::sync::OnceLock;

/// Bundle envelope version. Mirrors the `version: 1` envelope on the
/// embedded `tooldef.json`; bump in lock-step with format changes.
const BUNDLE_VERSION: u32 = 1;

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
                "outputSchema": td.output_schema,
            })
        })
        .collect();
    json!({
        "version": BUNDLE_VERSION,
        "tools": tools,
    })
}

/// Word + leaf counts for the bundle, lazily computed. Word count is over
/// the pretty-printed form (what `output::emit` writes to stdout).
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

/// Count non-container nodes (object keys aren't counted, only values).
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
    fn bundle_lists_three_tools_with_outputschema() {
        let defs = load_tool_defs().expect("load_tool_defs");
        let v = run(&defs).expect("schema::run");
        let tools = v["tools"].as_array().expect("tools array");
        assert_eq!(tools.len(), 3, "expected 3 tools, got {}", tools.len());
        for entry in tools {
            let entry = entry.as_object().expect("tool entry object");
            assert!(entry.contains_key("name"));
            let schema = entry.get("outputSchema").expect("outputSchema");
            assert!(schema.is_object(), "outputSchema must be a JSON object");
            assert!(
                !schema.as_object().unwrap().is_empty(),
                "outputSchema must not be empty"
            );
        }
    }

    #[test]
    fn count_leaves_walks_arrays_and_objects() {
        let v = json!({"a": 1, "b": [2, 3, {"c": "x"}], "d": null});
        // 1 (a=1) + 2 (2,3) + 1 (c="x") + 1 (d=null) = 5
        assert_eq!(count_leaves(&v), 5);
    }
}
