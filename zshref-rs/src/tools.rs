//! The tool set: per tool, a `Tool` — metadata for every adapter and the
//! implementation behind it — plus the shared request path.
//!
//! A `ToolName` has two forms: the stem, which is the CLI subcommand
//! (`docs`), and the JSON-surface name (`zsh_docs`) — MCP clients show
//! tools from many servers in one flat namespace, so the prefix avoids
//! collisions and makes logs self-describing. Adding a tool: a `ToolName`
//! variant, a module with `run` and `tool`, a line in `ToolSet::build`, a
//! row in `prose::preamble`. Category names, subKind values and record
//! counts reach the metadata from the loaded corpus — never as hand-typed
//! lists.

pub mod docs;
pub mod envelope;
pub mod info;
pub mod list;
pub mod prose;
pub mod schema;
pub mod search;
pub mod text;

use crate::corpus::Corpus;
use anyhow::{anyhow, Result};
use schema::Shape;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::fmt;
use text::Prose;

/// A tool's name; `Display` is the stem.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum ToolName {
    Docs,
    Search,
    List,
}

impl ToolName {
    const JSON_PREFIX: &str = "zsh_";

    /// The CLI subcommand (`docs`).
    pub fn stem(self) -> &'static str {
        match self {
            Self::Docs => "docs",
            Self::Search => "search",
            Self::List => "list",
        }
    }

    /// The name on the JSON surface (`zsh_docs`).
    pub fn json(self) -> String {
        format!("{}{}", Self::JSON_PREFIX, self.stem())
    }
}

impl fmt::Display for ToolName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.stem())
    }
}

pub struct Tool {
    pub name: ToolName,
    pub prose: Prose,
    pub fields: Vec<Field>,
    pub input_schema: Value,
    pub output_schema: Value,
    run: Erased,
}

/// The implementation behind `Value` in and out; `Send + Sync` because the
/// MCP server holds the `ToolSet` inside its handler.
type Erased = Box<dyn Fn(&Value, &Corpus) -> Result<Value> + Send + Sync>;

/// One `input_schema` property. Key, prose and shape are declared together
/// so a field cannot lack its brief or its schema entry.
pub struct Field {
    pub key: &'static str,
    pub prose: Prose,
    pub shape: Shape,
    pub required: bool,
}

impl Field {
    pub fn required(key: &'static str, prose: Prose, shape: Shape) -> Self {
        Self {
            key,
            prose,
            shape,
            required: true,
        }
    }

    pub fn optional(key: &'static str, prose: Prose, shape: Shape) -> Self {
        Self {
            key,
            prose,
            shape,
            required: false,
        }
    }
}

impl Tool {
    /// `I` decodes exactly what `input_schema` (built from `fields`) admits.
    pub fn new<I: DeserializeOwned + 'static>(
        name: ToolName,
        prose: Prose,
        fields: Vec<Field>,
        output_schema: Value,
        run: fn(I, &Corpus) -> Result<Value>,
    ) -> Self {
        let run = Box::new(move |input: &Value, corpus: &Corpus| {
            let input = I::deserialize(input).map_err(|e| anyhow!("invalid input: {e}"))?;
            run(input, corpus)
        });
        Self {
            input_schema: schema::input_schema(&fields),
            name,
            prose,
            fields,
            output_schema,
            run,
        }
    }

    /// The request path of every adapter: decode the typed input, then run.
    /// Decode failures read `invalid input: <serde message>`.
    pub fn call(&self, input: &Value, corpus: &Corpus) -> Result<Value> {
        (self.run)(input, corpus)
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

    /// The tool behind a `ToolName`; every variant is registered.
    pub fn get(&self, name: ToolName) -> &Tool {
        self.tools
            .iter()
            .find(|t| t.name == name)
            .unwrap_or_else(|| panic!("{name} is not a registered tool"))
    }

    pub fn by_stem(&self, stem: &str) -> Option<&Tool> {
        self.tools.iter().find(|t| t.name.stem() == stem)
    }

    pub fn by_json(&self, name: &str) -> Option<&Tool> {
        name.strip_prefix(ToolName::JSON_PREFIX)
            .and_then(|stem| self.by_stem(stem))
    }
}

#[cfg(test)]
mod tests {
    //! Shape guards on the prose every adapter renders — not a review
    //! substitute: tone and length drift are the reviewer's.
    use super::*;
    use crate::corpus::{load_corpus, DOC_CATEGORIES};
    use regex::Regex;
    use serde_json::{json, Map};
    use std::collections::BTreeSet;
    use std::sync::LazyLock;
    use text::Target;

    static CORPUS: LazyLock<Corpus> = LazyLock::new(|| load_corpus().expect("load_corpus"));
    static TOOLS: LazyLock<ToolSet> = LazyLock::new(|| ToolSet::build(&CORPUS));

    /// Widest tool `brief` the CLI's commands column renders on one line.
    const BRIEF_MAX_LEN: usize = 50;

    /// Widest field `brief` the CLI's options column renders on one line.
    const FIELD_BRIEF_MAX_LEN: usize = 60;

    fn long(tool: &Tool, t: Target) -> &str {
        tool.prose.long[t].as_str()
    }

    fn field_long<'a>(tool: &'a Tool, key: &str, t: Target) -> &'a str {
        tool.fields
            .iter()
            .find(|f| f.key == key)
            .unwrap_or_else(|| panic!("{}: no field {key}", tool.name))
            .prose
            .long[t]
            .as_str()
    }

    fn has_flag_syntax(s: &str) -> bool {
        Regex::new(r"--\w").unwrap().is_match(s)
    }

    #[test]
    fn names_are_stable() {
        let names: Vec<ToolName> = TOOLS.tools.iter().map(|t| t.name).collect();
        assert_eq!(names, [ToolName::Docs, ToolName::Search, ToolName::List]);
        let shape = Regex::new(r"^zsh_[a-z][a-z0-9_]*$").unwrap();
        for name in names {
            let json = name.json();
            assert!(shape.is_match(&json), "{json}");
            assert_eq!(TOOLS.by_json(&json).map(|t| t.name), Some(name));
        }
    }

    #[test]
    fn briefs_fit_the_columns() {
        for tool in &TOOLS.tools {
            let b = tool.prose.brief.as_str();
            assert!(b.len() <= BRIEF_MAX_LEN, "{}: {b:?}", tool.name);
            for f in &tool.fields {
                let fb = f.prose.brief.as_str();
                assert!(
                    fb.len() <= FIELD_BRIEF_MAX_LEN,
                    "{}.{}: {fb:?}",
                    tool.name,
                    f.key
                );
            }
        }
    }

    #[test]
    fn json_descriptions_state_the_trust_model_and_terminal_help_does_not() {
        for tool in &TOOLS.tools {
            let json = long(tool, Target::Json).to_lowercase();
            assert!(json.len() >= 80, "{}", tool.name);
            assert!(json.contains("shell execution"), "{}", tool.name);
            assert!(json.contains("environment access"), "{}", tool.name);
            let terminal = long(tool, Target::Terminal).to_lowercase();
            assert!(!terminal.contains("shell execution"), "{}", tool.name);
        }
    }

    #[test]
    fn prose_names_parameters_never_cli_flags() {
        for t in [Target::Terminal, Target::Json] {
            assert!(!has_flag_syntax(prose::preamble(t).as_str()), "{t:?}");
            for tool in &TOOLS.tools {
                assert!(!has_flag_syntax(long(tool, t)), "{}", tool.name);
                assert!(!has_flag_syntax(tool.prose.brief.as_str()), "{}", tool.name);
                for f in &tool.fields {
                    assert!(
                        !has_flag_syntax(f.prose.brief.as_str()),
                        "{}.{}",
                        tool.name,
                        f.key
                    );
                    assert!(
                        !has_flag_syntax(field_long(tool, f.key, t)),
                        "{}.{}",
                        tool.name,
                        f.key
                    );
                }
            }
        }
    }

    #[test]
    fn each_target_names_tools_its_own_way() {
        let search = TOOLS.get(ToolName::Search);
        assert!(long(search, Target::Json).contains("`zsh_docs`"));
        assert!(long(search, Target::Terminal).contains("`zshref docs`"));
        for tool in &TOOLS.tools {
            assert!(
                !long(tool, Target::Terminal).contains("zsh_"),
                "{}",
                tool.name
            );
        }
        assert!(!prose::preamble(Target::Terminal).as_str().contains("zsh_"));
    }

    #[test]
    fn input_schemas_declare_required_keys_and_the_category_enum() {
        let required = [
            (ToolName::Docs, json!(["key"])),
            (ToolName::Search, json!(["query"])),
        ];
        for (sub, keys) in required {
            assert_eq!(TOOLS.get(sub).input_schema["required"], keys, "{sub}");
        }
        assert!(TOOLS
            .get(ToolName::List)
            .input_schema
            .get("required")
            .is_none());
        for tool in &TOOLS.tools {
            assert_eq!(tool.input_schema["type"], "object", "{}", tool.name);
            assert_eq!(tool.output_schema["type"], "object", "{}", tool.name);
            assert_eq!(
                tool.input_schema["properties"]["category"]["enum"],
                json!(*DOC_CATEGORIES),
                "{}",
                tool.name
            );
            for f in &tool.fields {
                assert_eq!(
                    tool.input_schema["properties"][f.key]["description"],
                    field_long(tool, f.key, Target::Json),
                    "{}.{}",
                    tool.name,
                    f.key
                );
            }
        }
    }

    #[test]
    fn docs_prose_states_negation_and_multi_match() {
        let d = long(TOOLS.get(ToolName::Docs), Target::Json);
        assert!(d.to_lowercase().contains("negat"));
        assert!(d.contains("NO_"));
        assert!(d.to_lowercase().contains("multiple matches"));
        assert!(d.contains("`category`"));
    }

    #[test]
    fn category_help_claims_cardinality_only_for_docs() {
        let docs = field_long(TOOLS.get(ToolName::Docs), "category", Target::Json).to_lowercase();
        assert!(docs.contains("at most one match"));
        assert!(docs.contains("one match per category"));
        for sub in [ToolName::Search, ToolName::List] {
            let help = field_long(TOOLS.get(sub), "category", Target::Json).to_lowercase();
            assert!(
                !help.contains("one match") && !help.contains("at most"),
                "{sub}"
            );
        }
    }

    #[test]
    fn docs_category_help_lists_every_category_label() {
        let help = field_long(TOOLS.get(ToolName::Docs), "category", Target::Json);
        for (cat, label) in &CORPUS.index.doc_category_labels {
            assert!(help.contains(label.as_str()), "{cat}: {label:?}");
        }
    }

    #[test]
    fn follow_up_tools_are_named() {
        let search = TOOLS.get(ToolName::Search);
        assert!(long(search, Target::Json).to_lowercase().contains("fuzzy"));
        assert!(long(search, Target::Json).contains("zsh_docs"));
        let limit = field_long(search, "limit", Target::Json).to_lowercase();
        assert!(limit.contains("limit") || limit.contains("maximum"));
        assert!(long(TOOLS.get(ToolName::List), Target::Json).contains("zsh_docs"));
    }

    #[test]
    fn entry_tools_name_the_zsh_tag() {
        let tag = &CORPUS.index.zsh_upstream.tag;
        for (sub, expected) in [
            (ToolName::Docs, true),
            (ToolName::Search, true),
            (ToolName::List, false),
        ] {
            assert_eq!(
                long(TOOLS.get(sub), Target::Json).contains(tag.as_str()),
                expected,
                "{sub}"
            );
        }
    }

    #[test]
    fn preamble_mentions_only_real_tools() {
        let preamble = prose::preamble(Target::Json);
        let mentioned: Vec<&str> = Regex::new(r"\bzsh_[a-z][a-z0-9_]*\b")
            .unwrap()
            .find_iter(preamble.as_str())
            .map(|m| m.as_str())
            .collect();
        assert!(!mentioned.is_empty());
        for name in mentioned {
            assert!(
                TOOLS.by_json(name).is_some(),
                "preamble names {name}, not a tool"
            );
        }
    }

    fn backticked(s: &str) -> BTreeSet<String> {
        Regex::new(r"`([^`]+)`")
            .unwrap()
            .captures_iter(s)
            .map(|c| c[1].to_string())
            .collect()
    }

    /// The typed `Input` behind each tool decodes exactly what its
    /// `input_schema` admits: every property, only those, and the same
    /// required set.
    #[test]
    fn input_structs_mirror_the_input_schemas() {
        let sample = |shape: Shape| match shape {
            Shape::Text => json!("echo"),
            Shape::Category => json!(DOC_CATEGORIES[0]),
            Shape::Limit => json!(1),
        };
        for tool in &TOOLS.tools {
            let name = tool.name;
            let keys: BTreeSet<String> = tool.fields.iter().map(|f| f.key.to_string()).collect();
            let full: Map<String, Value> = tool
                .fields
                .iter()
                .map(|f| (f.key.to_string(), sample(f.shape)))
                .collect();
            tool.call(&Value::Object(full.clone()), &CORPUS)
                .unwrap_or_else(|e| panic!("{name}: {e}"));

            let required: BTreeSet<String> = tool.input_schema["required"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect();
            match tool.call(&json!({}), &CORPUS) {
                Ok(_) => assert!(required.is_empty(), "{name}: `{{}}` decoded"),
                Err(e) => {
                    let e = e.to_string();
                    assert!(e.contains("missing field"), "{name}: {e}");
                    assert!(backticked(&e).is_subset(&required), "{name}: {e}");
                }
            }

            let mut extra = full;
            extra.insert("bogus".into(), json!(1));
            let e = tool
                .call(&Value::Object(extra), &CORPUS)
                .unwrap_err()
                .to_string();
            assert!(e.contains("unknown field `bogus`"), "{name}: {e}");
            let mut expected = backticked(&e);
            expected.remove("bogus");
            assert_eq!(expected, keys, "{name}: {e}");
        }
    }

    #[test]
    fn run_wires_the_corpus_through() {
        let docs = TOOLS
            .get(ToolName::Docs)
            .call(&json!({ "key": "echo" }), &CORPUS)
            .unwrap();
        assert_eq!(docs["matches"][0]["category"], "builtin");
        assert!(!docs["matches"][0]["mdBody"].as_str().unwrap().is_empty());

        let search = TOOLS
            .get(ToolName::Search)
            .call(
                &json!({ "query": "echo", "category": "builtin", "limit": 3 }),
                &CORPUS,
            )
            .unwrap();
        assert_eq!(search["matches"][0]["id"], "echo");

        let list = TOOLS
            .get(ToolName::List)
            .call(
                &json!({ "category": "precmd_modifier", "limit": 100 }),
                &CORPUS,
            )
            .unwrap();
        let rows = list["matches"].as_array().unwrap();
        assert!(!rows.is_empty());
        assert!(rows.iter().all(|m| m["category"] == "precmd_modifier"));
    }
}
