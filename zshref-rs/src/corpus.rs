//! Corpus + tool-def JSON decoding.
//!
//! Record shapes are intentionally loose (`serde_json::Value` for per-category
//! bodies) — the CLI only needs a handful of well-known fields (`name`,
//! `display`, `id`, `markdown`, …) and benefits from forward-compatibility
//! with schema additions.

use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::{Map, Value};

// Data-source paths are cfg-gated: `build.rs` picks `vendored` (data/*.json
// shipped inside the crate) or `monorepo` (JSONs read from the sibling TS
// packages' dist/). See DATA-SYNC.md.
#[cfg(data_source = "vendored")]
macro_rules! corpus_path {
    ($f:literal) => {
        concat!("../data/", $f)
    };
}
#[cfg(data_source = "vendored")]
macro_rules! tooldef_path {
    ($f:literal) => {
        concat!("../data/", $f)
    };
}
#[cfg(data_source = "monorepo")]
macro_rules! corpus_path {
    ($f:literal) => {
        concat!("../../packages/zsh-core/dist/json/", $f)
    };
}
#[cfg(data_source = "monorepo")]
macro_rules! tooldef_path {
    ($f:literal) => {
        concat!("../../packages/zsh-core-tooldef/dist/json/", $f)
    };
}

const TOOLDEF_JSON: &[u8] = include_bytes!(tooldef_path!("tooldef.json"));

const INDEX_JSON: &[u8] = include_bytes!(corpus_path!("index.json"));

// One per DocCategory. Keep this list in lock-step with `docCategories` in
// `packages/zsh-core/src/docs/taxonomy.ts`. Order matters for `search`,
// which lists records in this order when the query is empty (TS parity).
// `classify` walks `CLASSIFY_ORDER` instead — see `tools/classify.rs`.
macro_rules! include_category {
    ($cat:literal, $file:literal) => {
        ($cat, include_bytes!(corpus_path!($file)) as &[u8])
    };
}

const CATEGORY_FILES: &[(&str, &[u8])] = &[
    include_category!("option", "options.json"),
    include_category!("cond_op", "cond-ops.json"),
    include_category!("builtin", "builtins.json"),
    include_category!("precmd", "precmds.json"),
    include_category!("shell_param", "shell-params.json"),
    include_category!("complex_command", "complex-commands.json"),
    include_category!("reserved_word", "reserved-words.json"),
    include_category!("redir", "redirections.json"),
    include_category!("process_subst", "process-substs.json"),
    include_category!("param_expn", "param-expns.json"),
    include_category!("subscript_flag", "subscript-flags.json"),
    include_category!("param_flag", "param-flags.json"),
    include_category!("history", "history.json"),
    include_category!("glob_op", "glob-operators.json"),
    include_category!("glob_flag", "glob-flags.json"),
    include_category!("glob_qualifier", "glob-qualifiers.json"),
    include_category!("prompt_escape", "prompt-escapes.json"),
    include_category!("zle_widget", "zle-widgets.json"),
];

/// Classify-walk order. Mirrors `classifyOrder` in
/// `packages/zsh-core/src/docs/taxonomy.ts`. The first category whose
/// resolver matches wins.
pub const CLASSIFY_ORDER: &[&str] = &[
    "complex_command",
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
    "glob_qualifier",
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
    /// Suite-level intent→tool cheat-sheet. Rendered into `zshref --help`
    /// after `cli::cli_prose()` rewrites `zsh_*` tool names to `zshref *`.
    /// Source of truth is `TOOL_SUITE_PREAMBLE` in
    /// `packages/zsh-core-tooldef/src/tool-defs.ts`; the drift warning
    /// there also applies here.
    pub preamble: String,
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

/// Metadata fields on the corpus index. `package_version` and `zsh_upstream`
/// back the enriched `--version` output and the `zshref info` subcommand.
/// `doc_categories` and `classify_order` are the canonical taxonomy lists
/// from the TS source of truth; the drift-guard tests in this module
/// cross-check them against the Rust-side hard-coded constants. `version`
/// (schema version) is still unused on the read side; kept for future
/// compatibility gating.
#[derive(Debug, Deserialize)]
pub struct Index {
    #[allow(dead_code)]
    pub version: u32,
    #[serde(rename = "packageVersion")]
    pub package_version: String,
    #[serde(rename = "zshUpstream")]
    pub zsh_upstream: ZshUpstream,
    // `doc_categories` / `classify_order` are only read by the drift-guard
    // tests in this module; production code uses the Rust-side hard-coded
    // `CATEGORY_FILES` / `CLASSIFY_ORDER` constants. Silence dead_code for
    // non-test builds without removing the fields — the tests are their
    // entire reason to exist.
    #[cfg_attr(not(test), allow(dead_code))]
    #[serde(rename = "docCategories", default)]
    pub doc_categories: Vec<String>,
    #[cfg_attr(not(test), allow(dead_code))]
    #[serde(rename = "classifyOrder", default)]
    pub classify_order: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ZshUpstream {
    pub tag: String,
    pub commit: String,
    pub date: String,
}

pub struct Corpus {
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
    let index: Index = serde_json::from_slice(INDEX_JSON).context("parsing embedded index.json")?;
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

#[cfg(test)]
mod tests {
    //! Drift guards. The Rust source holds three hard-coded taxonomy lists —
    //! `CATEGORY_FILES` (and its derived `categories` order), `CLASSIFY_ORDER`,
    //! and `cli::DOC_CATEGORIES` — that must stay in sync with the TS source
    //! (`packages/zsh-core/src/docs/taxonomy.ts`). We cross-check them here
    //! against the canonical lists emitted into `index.json`. If the TS side
    //! adds or reorders a category, this test fails, prompting the matching
    //! Rust-side edit.
    //!
    //! Also verifies that `classify::record_id`'s per-category key lookup
    //! returns a non-empty string for at least one record in each category —
    //! catches drift where a category's record shape gains a new `id` field
    //! but `record_id` still points at the old one.
    use super::*;

    #[test]
    fn category_files_matches_ts_doc_categories() {
        let corpus = load_corpus().expect("load_corpus");
        let rust_names: Vec<&str> = CATEGORY_FILES.iter().map(|(n, _)| *n).collect();
        let ts_names: Vec<&str> = corpus
            .index
            .doc_categories
            .iter()
            .map(String::as_str)
            .collect();
        assert_eq!(
            rust_names, ts_names,
            "CATEGORY_FILES drifted from index.docCategories — sync with \
             packages/zsh-core/src/docs/taxonomy.ts::docCategories"
        );
    }

    #[test]
    fn classify_order_matches_ts_classify_order() {
        let corpus = load_corpus().expect("load_corpus");
        let ts_names: Vec<&str> = corpus
            .index
            .classify_order
            .iter()
            .map(String::as_str)
            .collect();
        assert_eq!(
            CLASSIFY_ORDER,
            ts_names.as_slice(),
            "CLASSIFY_ORDER drifted from index.classifyOrder — sync with \
             packages/zsh-core/src/docs/taxonomy.ts::classifyOrder"
        );
    }

    #[test]
    fn doc_categories_constant_matches_ts_doc_categories() {
        // `cli::DOC_CATEGORIES` duplicates the category list for `--category`
        // PossibleValues. Make sure it stays equal to the canonical set.
        let corpus = load_corpus().expect("load_corpus");
        let ts_names: Vec<&str> = corpus
            .index
            .doc_categories
            .iter()
            .map(String::as_str)
            .collect();
        assert_eq!(
            crate::cli::DOC_CATEGORIES,
            ts_names.as_slice(),
            "cli::DOC_CATEGORIES drifted from index.docCategories"
        );
    }

    #[test]
    fn corpus_id_and_display_are_ascii() {
        // `crate::fuzzy::score` is ASCII-only — non-ASCII `id` or `display`
        // values silently fall through to "no fuzzy match" for those
        // records. Fail loud here so upstream drift (a non-ASCII identifier
        // sneaking into the corpus) forces a conscious decision before the
        // search tier degrades in production.
        let corpus = load_corpus().expect("load_corpus");
        let mut violations: Vec<String> = Vec::new();
        for cat in &corpus.categories {
            for rec in &cat.records {
                let id = crate::tools::classify::record_id(cat.name, rec);
                let display = crate::tools::classify::record_display(cat.name, rec);
                if !id.is_ascii() {
                    violations.push(format!("category {}: id {:?}", cat.name, id));
                }
                if !display.is_ascii() {
                    violations.push(format!("category {}: display {:?}", cat.name, display));
                }
            }
        }
        assert!(
            violations.is_empty(),
            "non-ASCII id/display in corpus — src/fuzzy.rs assumes ASCII:\n  {}",
            violations.join("\n  ")
        );
    }

    #[test]
    fn record_id_key_populated_for_every_category() {
        // `classify::record_id` dispatches per category to a specific record
        // field. If the TS record shape for a category changes and the id
        // key moves, Rust would silently read empty strings. This guards it.
        let corpus = load_corpus().expect("load_corpus");
        for cat in &corpus.categories {
            let first = cat
                .records
                .first()
                .unwrap_or_else(|| panic!("category {} has zero records", cat.name));
            let id = crate::tools::classify::record_id(cat.name, first);
            assert!(
                !id.is_empty(),
                "record_id returned empty string for category {} — the \
                 category→field map in classify::record_id is stale",
                cat.name
            );
        }
    }
}
