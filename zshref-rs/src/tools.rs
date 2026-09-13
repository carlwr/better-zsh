//! The tool set: one `ToolDef` per tool — metadata for every adapter and
//! the implementation behind it — plus the shared request path.
//!
//! Names are `zsh_<verb>[_<object>]`: MCP clients show tools from many
//! servers in one flat namespace, so the prefix avoids collisions and
//! makes logs self-describing. Adding a tool: a module with `run` and
//! `def`, a line in `ToolDefs::build`, a row in `prose::PREAMBLE`.
//! Category names, subKind values and record counts reach the metadata
//! from the loaded corpus — never as hand-typed lists.

pub mod docs;
pub mod envelope;
pub mod info;
mod input;
pub mod list;
pub mod prose;
pub mod record_fields;
pub mod schema;
pub mod search;

use crate::corpus::Corpus;
use anyhow::Result;
use prose::FlagProse;
use serde_json::Value;
use std::collections::BTreeMap;

/// Widest `brief` the CLI's commands column renders on one line.
pub const BRIEF_MAX_LEN: usize = 50;

/// Widest `flag_briefs` entry the CLI's flags column renders on one line.
pub const FLAG_BRIEF_MAX_LEN: usize = 60;

/// One tool. Three prose fields for two audiences: `description` is the
/// long form for LLM tool selection and full help; `brief` and
/// `flag_briefs` are the column-width forms the CLI's commands and flags
/// columns need (MCP ignores them). The long form per flag is
/// `input_schema.properties[key].description`.
pub struct ToolDef {
    pub name: &'static str,
    pub brief: &'static str,
    pub description: String,
    pub flag_briefs: BTreeMap<String, String>,
    pub input_schema: Value,
    pub output_schema: Value,
    /// The implementation, over an input that satisfies `input_schema`
    /// with defaults filled.
    pub run: fn(&Value, &Corpus) -> Result<Value>,
}

/// One `input_schema` property. Key, prose and shape are declared together
/// so a flag cannot lack its brief or its schema entry.
pub struct Field {
    pub key: &'static str,
    pub prose: FlagProse,
    /// JSON Schema fragment; `description` is merged in from `prose`.
    pub shape: Value,
    pub required: bool,
}

impl Field {
    pub fn required(key: &'static str, prose: FlagProse, shape: Value) -> Self {
        Self {
            key,
            prose,
            shape,
            required: true,
        }
    }

    pub fn optional(key: &'static str, prose: FlagProse, shape: Value) -> Self {
        Self {
            key,
            prose,
            shape,
            required: false,
        }
    }
}

impl ToolDef {
    pub fn new(
        name: &'static str,
        brief: &'static str,
        description: String,
        fields: &[Field],
        output_schema: Value,
        run: fn(&Value, &Corpus) -> Result<Value>,
    ) -> Self {
        Self {
            name,
            brief,
            description,
            flag_briefs: fields
                .iter()
                .map(|f| (f.key.to_string(), f.prose.brief.clone()))
                .collect(),
            input_schema: schema::input_schema(fields),
            output_schema,
            run,
        }
    }
}

/// Every tool, in registration order (`tools/list`, the CLI's `Commands:`).
pub struct ToolDefs {
    pub tools: Vec<ToolDef>,
}

impl ToolDefs {
    /// Output schemas embed corpus facts (record total, subKind enums),
    /// hence the argument; build once per process.
    pub fn build(corpus: &Corpus) -> Self {
        Self {
            tools: vec![docs::def(corpus), search::def(corpus), list::def(corpus)],
        }
    }

    pub fn get(&self, name: &str) -> Option<&ToolDef> {
        self.tools.iter().find(|t| t.name == name)
    }
}

/// The request path for adapters that hand over raw JSON input (batch, MCP):
/// validate against `input_schema`, fill its defaults, dispatch. The CLI
/// arrives at `dispatch` directly — clap has already done both.
pub fn call(td: &ToolDef, raw_input: &Value, corpus: &Corpus) -> Result<Value> {
    input::validate(td, raw_input).map_err(anyhow::Error::msg)?;
    dispatch(td, &input::fill_defaults(td, raw_input), corpus)
}

/// Run a tool over a JSON `input` object that already satisfies its `input_schema`.
pub fn dispatch(td: &ToolDef, input: &Value, corpus: &Corpus) -> Result<Value> {
    (td.run)(input, corpus)
}

#[cfg(test)]
mod tests {
    //! Shape guards on the prose every adapter renders — not a review
    //! substitute: tone and length drift are the reviewer's.
    use super::*;
    use crate::corpus::{load_corpus, DOC_CATEGORIES};
    use regex::Regex;
    use serde_json::json;
    use std::sync::LazyLock;

    static CORPUS: LazyLock<Corpus> = LazyLock::new(|| load_corpus().expect("load_corpus"));
    static DEFS: LazyLock<ToolDefs> = LazyLock::new(|| ToolDefs::build(&CORPUS));

    fn tool(name: &str) -> &'static ToolDef {
        DEFS.get(name).unwrap_or_else(|| panic!("no tool {name}"))
    }

    fn flag_desc<'a>(td: &'a ToolDef, key: &str) -> &'a str {
        td.input_schema["properties"][key]["description"]
            .as_str()
            .unwrap_or_else(|| panic!("{}: flag {key} has no description", td.name))
    }

    fn has_flag_syntax(s: &str) -> bool {
        Regex::new(r"--\w").unwrap().is_match(s)
    }

    #[test]
    fn names_are_stable_snake_case_zsh_prefixed() {
        let names: Vec<&str> = DEFS.tools.iter().map(|t| t.name).collect();
        assert_eq!(names, ["zsh_docs", "zsh_search", "zsh_list"]);
        let shape = Regex::new(r"^zsh_[a-z][a-z0-9_]*$").unwrap();
        for name in names {
            assert!(shape.is_match(name), "{name}");
        }
    }

    #[test]
    fn briefs_are_one_line_phrases_within_the_column_caps() {
        for td in &DEFS.tools {
            let b = td.brief;
            assert!(
                !b.is_empty() && b.len() <= BRIEF_MAX_LEN,
                "{}: {b:?}",
                td.name
            );
            assert!(!b.contains('\n'), "{}: {b:?}", td.name);
            assert!(
                !b.starts_with(|c: char| c.is_ascii_uppercase()),
                "{}: {b:?}",
                td.name
            );
            assert!(!b.ends_with('.'), "{}: {b:?}", td.name);
            for (key, fb) in &td.flag_briefs {
                assert!(
                    !fb.is_empty() && fb.len() <= FLAG_BRIEF_MAX_LEN && !fb.contains('\n'),
                    "{}.{key}: {fb:?}",
                    td.name
                );
            }
        }
    }

    #[test]
    fn descriptions_state_the_trust_model() {
        for td in &DEFS.tools {
            let d = td.description.to_lowercase();
            assert!(d.len() >= 80, "{}", td.name);
            assert!(d.contains("shell execution"), "{}", td.name);
            assert!(d.contains("environment access"), "{}", td.name);
        }
    }

    #[test]
    fn prose_names_parameters_never_cli_flags() {
        assert!(!has_flag_syntax(prose::PREAMBLE));
        for td in &DEFS.tools {
            assert!(!has_flag_syntax(&td.description), "{}", td.name);
            assert!(!has_flag_syntax(td.brief), "{}", td.name);
            for (key, fb) in &td.flag_briefs {
                assert!(!has_flag_syntax(fb), "{}.{key}", td.name);
                assert!(!has_flag_syntax(flag_desc(td, key)), "{}.{key}", td.name);
            }
        }
    }

    #[test]
    fn input_schemas_declare_required_keys_and_the_category_enum() {
        let required = [
            ("zsh_docs", json!(["key"])),
            ("zsh_search", json!(["query"])),
        ];
        for (name, keys) in required {
            assert_eq!(tool(name).input_schema["required"], keys, "{name}");
        }
        assert!(tool("zsh_list").input_schema.get("required").is_none());
        for td in &DEFS.tools {
            assert_eq!(td.input_schema["type"], "object", "{}", td.name);
            assert_eq!(td.output_schema["type"], "object", "{}", td.name);
            assert_eq!(
                td.input_schema["properties"]["category"]["enum"],
                json!(*DOC_CATEGORIES),
                "{}",
                td.name
            );
        }
    }

    #[test]
    fn docs_prose_states_negation_and_multi_match() {
        let d = &tool("zsh_docs").description;
        assert!(d.to_lowercase().contains("negat"));
        assert!(d.contains("NO_"));
        assert!(d.to_lowercase().contains("multiple matches"));
        assert!(d.contains("`category`"));
    }

    #[test]
    fn category_help_claims_cardinality_only_for_docs() {
        let docs = flag_desc(tool("zsh_docs"), "category").to_lowercase();
        assert!(docs.contains("at most one match"));
        assert!(docs.contains("one match per category"));
        for name in ["zsh_search", "zsh_list"] {
            let help = flag_desc(tool(name), "category").to_lowercase();
            assert!(
                !help.contains("one match") && !help.contains("at most"),
                "{name}"
            );
        }
    }

    #[test]
    fn docs_category_help_lists_every_category_label() {
        let help = flag_desc(tool("zsh_docs"), "category");
        for (cat, label) in &CORPUS.index.doc_category_labels {
            assert!(help.contains(label.as_str()), "{cat}: {label:?}");
        }
    }

    #[test]
    fn follow_up_tools_are_named() {
        let search = tool("zsh_search");
        assert!(search.description.to_lowercase().contains("fuzzy"));
        assert!(search.description.contains("zsh_docs"));
        let limit = flag_desc(search, "limit").to_lowercase();
        assert!(limit.contains("limit") || limit.contains("maximum"));
        assert!(tool("zsh_list").description.contains("zsh_docs"));
    }

    #[test]
    fn entry_tools_name_the_zsh_tag() {
        let tag = &CORPUS.index.zsh_upstream.tag;
        for (name, expected) in [
            ("zsh_docs", true),
            ("zsh_search", true),
            ("zsh_list", false),
        ] {
            assert_eq!(
                tool(name).description.contains(tag.as_str()),
                expected,
                "{name}"
            );
        }
    }

    #[test]
    fn preamble_mentions_only_real_tools() {
        let mentioned: Vec<&str> = Regex::new(r"\bzsh_[a-z][a-z0-9_]*\b")
            .unwrap()
            .find_iter(prose::PREAMBLE)
            .map(|m| m.as_str())
            .collect();
        assert!(!mentioned.is_empty());
        for name in mentioned {
            assert!(
                DEFS.get(name).is_some(),
                "preamble names {name}, not a tool"
            );
        }
    }

    #[test]
    fn run_wires_the_corpus_through() {
        let docs = dispatch(tool("zsh_docs"), &json!({ "key": "echo" }), &CORPUS).unwrap();
        assert_eq!(docs["matches"][0]["category"], "builtin");
        assert!(!docs["matches"][0]["mdBody"].as_str().unwrap().is_empty());

        let search = call(
            tool("zsh_search"),
            &json!({ "query": "echo", "category": "builtin", "limit": 3 }),
            &CORPUS,
        )
        .unwrap();
        assert_eq!(search["matches"][0]["id"], "echo");

        let list = call(
            tool("zsh_list"),
            &json!({ "category": "precmd_modifier", "limit": 100 }),
            &CORPUS,
        )
        .unwrap();
        let rows = list["matches"].as_array().unwrap();
        assert!(!rows.is_empty());
        assert!(rows.iter().all(|m| m["category"] == "precmd_modifier"));
    }
}
