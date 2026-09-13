//! JSON Schema for tool inputs and outputs; the `zshref schema` bundle.
//!
//! Input schemas double as the wire contract for `zshref batch` and drive
//! the CLI's flags. Output schemas are an envelope over per-category
//! `oneOf` match branches sharing `$defs`; category names, `subKind`
//! enums and the record total come from the loaded corpus. Every tool
//! response the test suite sees is validated against its output schema.
//! `--help` long-about advertises the bundle's size to discourage piping
//! it into agent context.

use crate::corpus::{Corpus, DOC_CATEGORIES};
use crate::resolver::ResolverFeedback;
use crate::tools::envelope::ENVELOPE_KEYS;
use crate::tools::prose::DEFAULT_LIMIT;
use crate::tools::record_fields::record_sub_kind;
use crate::tools::{Field, ToolDefs};
use anyhow::Result;
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::sync::OnceLock;

/// Format version of the `zshref schema` bundle.
pub const SCHEMA_VERSION: u32 = 1;

// --- input -------------------------------------------------------------------

pub fn string_shape() -> Value {
    json!({ "type": "string" })
}

pub fn category_shape() -> Value {
    json!({ "type": "string", "enum": *DOC_CATEGORIES })
}

/// No `maximum`: a `limit` above the corpus size clamps silently.
pub fn limit_shape() -> Value {
    json!({ "type": "integer", "minimum": 0, "default": DEFAULT_LIMIT })
}

pub fn input_schema(fields: &[Field]) -> Value {
    let properties: Map<String, Value> = fields
        .iter()
        .map(|f| {
            let mut spec = f
                .shape
                .as_object()
                .cloned()
                .expect("field shape is an object");
            spec.insert("description".into(), Value::String(f.prose.long.clone()));
            (f.key.to_string(), Value::Object(spec))
        })
        .collect();
    let required: Vec<&str> = fields
        .iter()
        .filter(|f| f.required)
        .map(|f| f.key)
        .collect();
    let mut schema = Map::new();
    schema.insert("type".into(), json!("object"));
    schema.insert("properties".into(), Value::Object(properties));
    if !required.is_empty() {
        schema.insert("required".into(), json!(required));
    }
    schema.insert("additionalProperties".into(), json!(false));
    Value::Object(schema)
}

// --- output ------------------------------------------------------------------

/// Which optional match fields a tool emits. `feedback` is an optional slot;
/// the others are required when present.
#[derive(Default)]
pub struct MatchShape {
    pub score: bool,
    pub title: bool,
    pub md_body: bool,
    pub feedback: bool,
}

/// Envelope schema; `matches.items` is the per-category `oneOf`.
pub fn output_schema(shape: &MatchShape, corpus: &Corpus) -> Value {
    let sub_kinds = sub_kind_enums(corpus);
    let has_sub_kind = |cat: &str| sub_kinds.iter().any(|(c, _)| *c == cat);
    let branches: Vec<Value> = DOC_CATEGORIES
        .iter()
        .map(|cat| match_schema(cat, has_sub_kind(cat), shape))
        .collect();
    let total: usize = corpus.categories.iter().map(|c| c.records.len()).sum();
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": false,
        "required": ENVELOPE_KEYS,
        "$defs": defs(shape, &sub_kinds),
        "properties": {
            "matches": { "type": "array", "items": { "oneOf": branches } },
            "matchesReturned": { "type": "integer", "minimum": 0, "maximum": total },
            "matchesTotal": { "type": "integer", "minimum": 0 },
        },
    })
}

/// One `oneOf` branch: closed shape with `category` pinned by `const`.
/// `subKind` is required with a closed enum where the category has one,
/// forbidden otherwise (always-or-never per category).
fn match_schema(cat: &str, sub_kind: bool, shape: &MatchShape) -> Value {
    let mut properties = Map::new();
    let mut required = vec!["category", "id", "display"];
    properties.insert("category".into(), json!({ "const": cat }));
    properties.insert("id".into(), json!({ "$ref": "#/$defs/IdString" }));
    properties.insert("display".into(), json!({ "$ref": "#/$defs/DisplayString" }));
    if sub_kind {
        properties.insert(
            "subKind".into(),
            json!({ "$ref": format!("#/$defs/SubKind.{cat}") }),
        );
        required.push("subKind");
    }
    if shape.title {
        properties.insert("title".into(), json!({ "$ref": "#/$defs/TitleString" }));
        required.push("title");
    }
    if shape.md_body {
        properties.insert("mdBody".into(), json!({ "$ref": "#/$defs/MdBodyString" }));
        required.push("mdBody");
    }
    if shape.score {
        properties.insert(
            "score".into(),
            json!({ "type": "number", "minimum": 0, "maximum": 1 }),
        );
        required.push("score");
    }
    if shape.feedback {
        properties.insert("feedback".into(), json!({ "$ref": "#/$defs/Feedback" }));
    }
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": required,
        "properties": properties,
    })
}

/// Shared fragments. `IdString` (printable ASCII, no whitespace) and
/// `DisplayString` (printable ASCII) restate the corpus-ASCII invariant
/// the fixture and `corpus.rs` tests hold; `MdBodyString` and
/// `TitleString` allow Unicode prose.
fn defs(shape: &MatchShape, sub_kinds: &[(&str, Vec<String>)]) -> Value {
    let mut defs = Map::new();
    defs.insert(
        "IdString".into(),
        json!({ "type": "string", "minLength": 1, "pattern": r"^[\x21-\x7E]+$" }),
    );
    defs.insert(
        "DisplayString".into(),
        json!({ "type": "string", "minLength": 1, "pattern": r"^[\x20-\x7E]+$" }),
    );
    defs.insert(
        "MdBodyString".into(),
        json!({ "type": "string", "minLength": 1 }),
    );
    defs.insert(
        "TitleString".into(),
        json!({ "type": "string", "minLength": 1 }),
    );
    for (cat, values) in sub_kinds {
        defs.insert(format!("SubKind.{cat}"), json!({ "enum": values }));
    }
    if shape.feedback {
        defs.insert(
            "Feedback".into(),
            json!({ "oneOf": ResolverFeedback::kind_schemas() }),
        );
    }
    Value::Object(defs)
}

/// Sorted distinct `subKind` values per category, in category order;
/// categories without any are absent.
fn sub_kind_enums(corpus: &Corpus) -> Vec<(&'static str, Vec<String>)> {
    corpus
        .categories
        .iter()
        .filter_map(|cat| {
            let values: BTreeSet<String> = cat
                .records
                .iter()
                .filter_map(|rec| record_sub_kind(cat.name, rec))
                .collect();
            (!values.is_empty()).then(|| (cat.name, values.into_iter().collect()))
        })
        .collect()
}

// --- bundle ------------------------------------------------------------------

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
    json!({
        "version": SCHEMA_VERSION,
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
    use crate::corpus::load_corpus;

    #[test]
    fn bundle_has_expected_top_level_keys() {
        let corpus = load_corpus().expect("load_corpus");
        let v = run(&ToolDefs::build(&corpus)).expect("schema::run");
        let obj = v.as_object().expect("top-level object");
        assert_eq!(obj.get("version").and_then(Value::as_u64), Some(1));
        assert!(obj.contains_key("tools"));
    }

    #[test]
    fn bundle_lists_every_tool_with_input_and_output_schema() {
        let corpus = load_corpus().expect("load_corpus");
        let defs = ToolDefs::build(&corpus);
        let v = run(&defs).expect("schema::run");
        let tools = v["tools"].as_array().expect("tools array");
        assert_eq!(tools.len(), defs.tools.len());
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
    fn sub_kind_is_always_or_never_per_category() {
        // The branch schemas require `subKind` wherever the category has an
        // enum; a record without one would fail validation at runtime.
        let corpus = load_corpus().expect("load_corpus");
        for cat in &corpus.categories {
            let with: usize = cat
                .records
                .iter()
                .filter(|r| record_sub_kind(cat.name, r).is_some())
                .count();
            assert!(
                with == 0 || with == cat.records.len(),
                "{}: {with} of {} records carry a subKind",
                cat.name,
                cat.records.len()
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
