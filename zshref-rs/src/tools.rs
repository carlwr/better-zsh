//! The tool set: per tool, a `Tool` — metadata for every adapter and the
//! implementation behind it — plus the shared request path.
//!
//! Names are `zsh_<verb>[_<object>]`: MCP clients show tools from many
//! servers in one flat namespace, so the prefix avoids collisions and
//! makes logs self-describing. Adding a tool: a module with `run` and
//! `tool`, a line in `ToolSet::build`, a row in `prose::PREAMBLE`.
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
pub struct Tool {
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

impl Tool {
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
pub struct ToolSet {
    pub tools: Vec<Tool>,
}

impl ToolSet {
    /// Output schemas embed corpus facts (record total, subKind enums),
    /// hence the argument; build once per process.
    pub fn build(corpus: &Corpus) -> Self {
        Self {
            tools: vec![docs::tool(corpus), search::tool(corpus), list::tool(corpus)],
        }
    }

    pub fn get(&self, name: &str) -> Option<&Tool> {
        self.tools.iter().find(|t| t.name == name)
    }
}

/// The request path for adapters that hand over raw JSON input (batch, MCP):
/// validate against `input_schema`, fill its defaults, dispatch. The CLI
/// arrives at `dispatch` directly — clap has already done both.
pub fn call(tool: &Tool, raw_input: &Value, corpus: &Corpus) -> Result<Value> {
    input::validate(tool, raw_input).map_err(anyhow::Error::msg)?;
    dispatch(tool, &input::fill_defaults(tool, raw_input), corpus)
}

/// Run a tool over a JSON `input` object that already satisfies its `input_schema`.
pub fn dispatch(tool: &Tool, input: &Value, corpus: &Corpus) -> Result<Value> {
    (tool.run)(input, corpus)
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
    static TOOLS: LazyLock<ToolSet> = LazyLock::new(|| ToolSet::build(&CORPUS));

    fn by_name(name: &str) -> &'static Tool {
        TOOLS.get(name).unwrap_or_else(|| panic!("no tool {name}"))
    }

    fn flag_desc<'a>(tool: &'a Tool, key: &str) -> &'a str {
        tool.input_schema["properties"][key]["description"]
            .as_str()
            .unwrap_or_else(|| panic!("{}: flag {key} has no description", tool.name))
    }

    fn has_flag_syntax(s: &str) -> bool {
        Regex::new(r"--\w").unwrap().is_match(s)
    }

    #[test]
    fn names_are_stable_snake_case_zsh_prefixed() {
        let names: Vec<&str> = TOOLS.tools.iter().map(|t| t.name).collect();
        assert_eq!(names, ["zsh_docs", "zsh_search", "zsh_list"]);
        let shape = Regex::new(r"^zsh_[a-z][a-z0-9_]*$").unwrap();
        for name in names {
            assert!(shape.is_match(name), "{name}");
        }
    }

    #[test]
    fn briefs_are_one_line_phrases_within_the_column_caps() {
        for tool in &TOOLS.tools {
            let b = tool.brief;
            assert!(
                !b.is_empty() && b.len() <= BRIEF_MAX_LEN,
                "{}: {b:?}",
                tool.name
            );
            assert!(!b.contains('\n'), "{}: {b:?}", tool.name);
            assert!(
                !b.starts_with(|c: char| c.is_ascii_uppercase()),
                "{}: {b:?}",
                tool.name
            );
            assert!(!b.ends_with('.'), "{}: {b:?}", tool.name);
            for (key, fb) in &tool.flag_briefs {
                assert!(
                    !fb.is_empty() && fb.len() <= FLAG_BRIEF_MAX_LEN && !fb.contains('\n'),
                    "{}.{key}: {fb:?}",
                    tool.name
                );
            }
        }
    }

    #[test]
    fn descriptions_state_the_trust_model() {
        for tool in &TOOLS.tools {
            let d = tool.description.to_lowercase();
            assert!(d.len() >= 80, "{}", tool.name);
            assert!(d.contains("shell execution"), "{}", tool.name);
            assert!(d.contains("environment access"), "{}", tool.name);
        }
    }

    #[test]
    fn prose_names_parameters_never_cli_flags() {
        assert!(!has_flag_syntax(prose::PREAMBLE));
        for tool in &TOOLS.tools {
            assert!(!has_flag_syntax(&tool.description), "{}", tool.name);
            assert!(!has_flag_syntax(tool.brief), "{}", tool.name);
            for (key, fb) in &tool.flag_briefs {
                assert!(!has_flag_syntax(fb), "{}.{key}", tool.name);
                assert!(
                    !has_flag_syntax(flag_desc(tool, key)),
                    "{}.{key}",
                    tool.name
                );
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
            assert_eq!(by_name(name).input_schema["required"], keys, "{name}");
        }
        assert!(by_name("zsh_list").input_schema.get("required").is_none());
        for tool in &TOOLS.tools {
            assert_eq!(tool.input_schema["type"], "object", "{}", tool.name);
            assert_eq!(tool.output_schema["type"], "object", "{}", tool.name);
            assert_eq!(
                tool.input_schema["properties"]["category"]["enum"],
                json!(*DOC_CATEGORIES),
                "{}",
                tool.name
            );
        }
    }

    #[test]
    fn docs_prose_states_negation_and_multi_match() {
        let d = &by_name("zsh_docs").description;
        assert!(d.to_lowercase().contains("negat"));
        assert!(d.contains("NO_"));
        assert!(d.to_lowercase().contains("multiple matches"));
        assert!(d.contains("`category`"));
    }

    #[test]
    fn category_help_claims_cardinality_only_for_docs() {
        let docs = flag_desc(by_name("zsh_docs"), "category").to_lowercase();
        assert!(docs.contains("at most one match"));
        assert!(docs.contains("one match per category"));
        for name in ["zsh_search", "zsh_list"] {
            let help = flag_desc(by_name(name), "category").to_lowercase();
            assert!(
                !help.contains("one match") && !help.contains("at most"),
                "{name}"
            );
        }
    }

    #[test]
    fn docs_category_help_lists_every_category_label() {
        let help = flag_desc(by_name("zsh_docs"), "category");
        for (cat, label) in &CORPUS.index.doc_category_labels {
            assert!(help.contains(label.as_str()), "{cat}: {label:?}");
        }
    }

    #[test]
    fn follow_up_tools_are_named() {
        let search = by_name("zsh_search");
        assert!(search.description.to_lowercase().contains("fuzzy"));
        assert!(search.description.contains("zsh_docs"));
        let limit = flag_desc(search, "limit").to_lowercase();
        assert!(limit.contains("limit") || limit.contains("maximum"));
        assert!(by_name("zsh_list").description.contains("zsh_docs"));
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
                by_name(name).description.contains(tag.as_str()),
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
                TOOLS.get(name).is_some(),
                "preamble names {name}, not a tool"
            );
        }
    }

    #[test]
    fn run_wires_the_corpus_through() {
        let docs = dispatch(by_name("zsh_docs"), &json!({ "key": "echo" }), &CORPUS).unwrap();
        assert_eq!(docs["matches"][0]["category"], "builtin");
        assert!(!docs["matches"][0]["mdBody"].as_str().unwrap().is_empty());

        let search = call(
            by_name("zsh_search"),
            &json!({ "query": "echo", "category": "builtin", "limit": 3 }),
            &CORPUS,
        )
        .unwrap();
        assert_eq!(search["matches"][0]["id"], "echo");

        let list = call(
            by_name("zsh_list"),
            &json!({ "category": "precmd_modifier", "limit": 100 }),
            &CORPUS,
        )
        .unwrap();
        let rows = list["matches"].as_array().unwrap();
        assert!(!rows.is_empty());
        assert!(rows.iter().all(|m| m["category"] == "precmd_modifier"));
    }
}
