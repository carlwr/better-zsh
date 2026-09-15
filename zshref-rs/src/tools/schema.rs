//! JSON Schema for tool inputs and outputs; the `zshref schema` bundle.
//!
//! Input schemas double as the wire contract for `zshref batch` and drive
//! the CLI's flags. Output schemas are an envelope over per-category
//! `oneOf` match branches sharing `$defs`; category names, `subKind`
//! enums and the record total come from the loaded corpus. Every tool
//! response the test suite sees is validated against its output schema.
//! `--help` long-about advertises the bundle's size to discourage piping
//! it into agent context.

use crate::corpus::{Corpus, DocCategory, DOC_CATEGORIES};
use crate::resolver::ResolverFeedback;
use crate::tools::envelope::ENVELOPE_KEYS;
use crate::tools::{Field, ToolSet};
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;

/// Format version of the `zshref schema` bundle.
pub const SCHEMA_VERSION: u32 = 1;

/// `limit` when a `search` / `list` caller omits it: the schema's `default`
/// and the `Input` structs' serde default, from one constant.
pub const DEFAULT_LIMIT: u32 = 20;

pub fn default_limit() -> u32 {
    DEFAULT_LIMIT
}

/// An input field's value shape: its JSON Schema, and what the CLI flag
/// parses.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Shape {
    Text,
    /// Closed enum over the corpus' categories.
    Category,
    /// Defaults to `DEFAULT_LIMIT`. No `maximum`: a `limit` above the
    /// corpus size clamps silently.
    Limit,
}

impl Shape {
    pub fn schema(self) -> Value {
        match self {
            Self::Text => json!({ "type": "string" }),
            Self::Category => json!({ "type": "string", "enum": *DOC_CATEGORIES }),
            Self::Limit => json!({ "type": "integer", "minimum": 0, "default": DEFAULT_LIMIT }),
        }
    }
}

pub fn input_schema(fields: &[Field]) -> Value {
    let properties: Map<String, Value> = fields
        .iter()
        .map(|f| {
            let mut spec = f.shape.schema();
            spec["description"] = Value::String(f.prose.long.json.to_string());
            (f.key.to_string(), spec)
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
    let has_sub_kind = |cat: DocCategory| sub_kinds.iter().any(|(c, _)| *c == cat);
    let branches: Vec<Value> = DOC_CATEGORIES
        .iter()
        .map(|&cat| match_schema(cat, has_sub_kind(cat), shape))
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
fn match_schema(cat: DocCategory, sub_kind: bool, shape: &MatchShape) -> Value {
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
fn defs(shape: &MatchShape, sub_kinds: &[(DocCategory, Vec<String>)]) -> Value {
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
fn sub_kind_enums(corpus: &Corpus) -> Vec<(DocCategory, Vec<String>)> {
    corpus
        .categories
        .iter()
        .filter_map(|cat| {
            let values: BTreeSet<String> = cat
                .records
                .iter()
                .filter_map(|rec| rec.sub_kind().map(str::to_owned))
                .collect();
            (!values.is_empty()).then(|| (cat.name, values.into_iter().collect()))
        })
        .collect()
}

pub fn run(tool_set: &ToolSet) -> Value {
    let tools: Vec<Value> = tool_set
        .tools
        .iter()
        .map(|tool| {
            json!({
                "name": tool.name.json(),
                "inputSchema": tool.input_schema,
                "outputSchema": tool.output_schema,
            })
        })
        .collect();
    json!({
        "version": SCHEMA_VERSION,
        "tools": tools,
    })
}

/// Word count of the pretty-printed bundle — exact for `--pretty`, a slight
/// over-estimate for the compact default.
pub fn bundle_words(tool_set: &ToolSet) -> usize {
    serde_json::to_string_pretty(&run(tool_set)).map_or(0, |s| s.split_whitespace().count())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::load_corpus;

    #[test]
    fn bundle_has_expected_top_level_keys() {
        let corpus = load_corpus().expect("load_corpus");
        let v = run(&ToolSet::build(&corpus));
        let obj = v.as_object().expect("top-level object");
        assert_eq!(obj.get("version").and_then(Value::as_u64), Some(1));
        assert!(obj.contains_key("tools"));
    }

    #[test]
    fn bundle_lists_every_tool_with_input_and_output_schema() {
        let corpus = load_corpus().expect("load_corpus");
        let tool_set = ToolSet::build(&corpus);
        let v = run(&tool_set);
        let tools = v["tools"].as_array().expect("tools array");
        assert_eq!(tools.len(), tool_set.tools.len());
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
        // `match_schema` requires `subKind` wherever the category has an enum.
        let corpus = load_corpus().expect("load_corpus");
        for cat in &corpus.categories {
            let with: usize = cat
                .records
                .iter()
                .filter(|r| r.sub_kind().is_some())
                .count();
            assert!(
                with == 0 || with == cat.records.len(),
                "{}: {with} of {} records carry a subKind",
                cat.name,
                cat.records.len()
            );
        }
    }
}
