//! Corpus + tool-def JSON decoding.
//!
//! The JSONs are embedded in the binary at build time via `include_bytes!`.
//! The Makefile ensures the TS artifacts exist before `cargo build` runs.
//! Record shapes are intentionally loose (`serde_json::Value` for per-category
//! bodies) — the CLI only needs a handful of well-known fields (`name`,
//! `display`, `id`, `markdown`, …) and benefits from forward-compatibility
//! with schema additions.

use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::{Map, Value};

const TOOLDEF_JSON: &[u8] =
    include_bytes!("../../packages/zsh-core-tooldef/dist/json/tooldef.json");

const INDEX_JSON: &[u8] = include_bytes!("../../packages/zsh-core/dist/json/index.json");

// One per DocCategory. Keep this list in lock-step with `docCategories` in
// `packages/zsh-core/src/docs/taxonomy.ts`. Order matters for `search`,
// which lists records in this order when the query is empty (TS parity).
// `classify` walks `CLASSIFY_ORDER` instead — see `tools/classify.rs`.
macro_rules! include_category {
    ($cat:literal, $file:literal) => {
        ($cat, include_bytes!(concat!(
            "../../packages/zsh-core/dist/json/",
            $file
        )) as &[u8])
    };
}

const CATEGORY_FILES: &[(&str, &[u8])] = &[
    include_category!("option", "options.json"),
    include_category!("cond_op", "cond-ops.json"),
    include_category!("builtin", "builtins.json"),
    include_category!("precmd", "precmds.json"),
    include_category!("shell_param", "shell-params.json"),
    include_category!("reserved_word", "reserved-words.json"),
    include_category!("redir", "redirections.json"),
    include_category!("process_subst", "process-substs.json"),
    include_category!("param_expn", "param-expns.json"),
    include_category!("subscript_flag", "subscript-flags.json"),
    include_category!("param_flag", "param-flags.json"),
    include_category!("history", "history.json"),
    include_category!("glob_op", "glob-operators.json"),
    include_category!("glob_flag", "glob-flags.json"),
    include_category!("prompt_escape", "prompt-escapes.json"),
    include_category!("zle_widget", "zle-widgets.json"),
];

/// Classify-walk order. Mirrors `classifyOrder` in
/// `packages/zsh-core/src/docs/taxonomy.ts`. The first category whose
/// resolver matches wins.
pub const CLASSIFY_ORDER: &[&str] = &[
    "reserved_word",
    "precmd",
    "builtin",
    "cond_op",
    "shell_param",
    "process_subst",
    "param_expn",
    "param_flag",
    "subscript_flag",
    "glob_flag",
    "glob_op",
    "history",
    "prompt_escape",
    "zle_widget",
    "option",
    "redir",
];

#[derive(Debug, Deserialize)]
pub struct ToolDefs {
    #[allow(dead_code)]
    pub version: u32,
    pub tools: Vec<ToolDef>,
}

#[derive(Debug, Deserialize)]
pub struct ToolDef {
    pub name: String,
    pub brief: String,
    pub description: String,
    #[serde(rename = "flagBriefs")]
    pub flag_briefs: std::collections::BTreeMap<String, String>,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}

pub fn load_tool_defs() -> Result<ToolDefs> {
    serde_json::from_slice(TOOLDEF_JSON).context("parsing embedded tooldef.json")
}

/// Metadata fields on the corpus index — retained for future `--version`
/// enrichment and for `zshref info`-style introspection. Held but not
/// consumed today.
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct Index {
    pub version: u32,
    #[serde(rename = "packageVersion")]
    pub package_version: String,
    #[serde(rename = "zshUpstream")]
    pub zsh_upstream: ZshUpstream,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct ZshUpstream {
    pub tag: String,
    pub commit: String,
    pub date: String,
}

pub struct Corpus {
    #[allow(dead_code)]
    pub index: Index,
    /// One vec of records per category, in `CATEGORY_FILES` order
    /// (== `classifyOrder`). Each record is a JSON object; the
    /// CLI only pulls out `markdown` plus the category-specific id/display
    /// fields at point-of-use.
    pub categories: Vec<Category>,
}

pub struct Category {
    pub name: &'static str,
    pub records: Vec<Map<String, Value>>,
}

pub fn load_corpus() -> Result<Corpus> {
    let index: Index =
        serde_json::from_slice(INDEX_JSON).context("parsing embedded index.json")?;
    let mut categories = Vec::with_capacity(CATEGORY_FILES.len());
    for (name, bytes) in CATEGORY_FILES {
        let records: Vec<Map<String, Value>> = serde_json::from_slice(bytes)
            .with_context(|| format!("parsing embedded {name} JSON"))?;
        categories.push(Category { name, records });
    }
    Ok(Corpus { index, categories })
}

impl Corpus {
    pub fn category(&self, name: &str) -> Option<&Category> {
        self.categories.iter().find(|c| c.name == name)
    }
}
