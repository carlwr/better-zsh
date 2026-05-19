//! Corpus + tool-def JSON decoding.
//!
//! Record shapes are loose (`serde_json::Value`) — forward-compatible with
//! schema additions; the CLI only reads a handful of well-known fields.
//! Taxonomy lists come from the embedded `index.json` (TS source of truth).
//! The only Rust-side filename inventory is the `include_bytes!` table below;
//! `load_corpus` asserts every indexed file has embedded bytes.

use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::sync::LazyLock;

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

// `include_bytes!` requires literal compile-time paths → hand-maintained in
// alphabetical order matching `index.json.files`. Category→file→bytes mapping
// is driven at runtime by `index.json.categoryFiles`.
const FILE_BYTES: &[(&str, &[u8])] = &[
    (
        "arith-ops.json",
        include_bytes!(corpus_path!("arith-ops.json")),
    ),
    (
        "builtins.json",
        include_bytes!(corpus_path!("builtins.json")),
    ),
    (
        "complex-commands.json",
        include_bytes!(corpus_path!("complex-commands.json")),
    ),
    (
        "conditional-ops.json",
        include_bytes!(corpus_path!("conditional-ops.json")),
    ),
    (
        "glob-flags.json",
        include_bytes!(corpus_path!("glob-flags.json")),
    ),
    (
        "glob-operators.json",
        include_bytes!(corpus_path!("glob-operators.json")),
    ),
    (
        "glob-qualifiers.json",
        include_bytes!(corpus_path!("glob-qualifiers.json")),
    ),
    (
        "history-expns.json",
        include_bytes!(corpus_path!("history-expns.json")),
    ),
    (
        "job-specs.json",
        include_bytes!(corpus_path!("job-specs.json")),
    ),
    ("keymaps.json", include_bytes!(corpus_path!("keymaps.json"))),
    ("options.json", include_bytes!(corpus_path!("options.json"))),
    (
        "param-expns.json",
        include_bytes!(corpus_path!("param-expns.json")),
    ),
    (
        "param-expn-flags.json",
        include_bytes!(corpus_path!("param-expn-flags.json")),
    ),
    (
        "precmd-modifiers.json",
        include_bytes!(corpus_path!("precmd-modifiers.json")),
    ),
    (
        "process-substs.json",
        include_bytes!(corpus_path!("process-substs.json")),
    ),
    (
        "prompt-escapes.json",
        include_bytes!(corpus_path!("prompt-escapes.json")),
    ),
    (
        "redirections.json",
        include_bytes!(corpus_path!("redirections.json")),
    ),
    (
        "reserved-words.json",
        include_bytes!(corpus_path!("reserved-words.json")),
    ),
    (
        "special-params.json",
        include_bytes!(corpus_path!("special-params.json")),
    ),
    (
        "special-functions.json",
        include_bytes!(corpus_path!("special-functions.json")),
    ),
    (
        "subscript-flags.json",
        include_bytes!(corpus_path!("subscript-flags.json")),
    ),
    (
        "zle-widgets.json",
        include_bytes!(corpus_path!("zle-widgets.json")),
    ),
    (
        "comp-utils.json",
        include_bytes!(corpus_path!("comp-utils.json")),
    ),
];

fn file_bytes(name: &str) -> Option<&'static [u8]> {
    FILE_BYTES
        .iter()
        .find_map(|(n, b)| (*n == name).then_some(*b))
}

/// Parsed `index.json`. Lazy-decoded once; taxonomy statics project from it.
static INDEX: LazyLock<Index> =
    LazyLock::new(|| serde_json::from_slice(INDEX_JSON).expect("embedded index.json must parse"));

/// Closed `DocCategory` list in primary ordering. Leaked to `'static` so
/// clap's `PossibleValues` can hold `&'static str` without per-call alloc.
pub static DOC_CATEGORIES: LazyLock<Vec<&'static str>> = LazyLock::new(|| {
    INDEX
        .doc_categories
        .iter()
        .map(|s| Box::leak(s.clone().into_boxed_str()) as &'static str)
        .collect()
});

/// Resolver-walk order. Sourced from `index.json.classifyOrder`.
pub static CLASSIFY_ORDER: LazyLock<Vec<&'static str>> = LazyLock::new(|| {
    INDEX
        .classify_order
        .iter()
        .map(|s| Box::leak(s.clone().into_boxed_str()) as &'static str)
        .collect()
});

/// Hook base names for the special_function resolver (`index.json.hookNames`).
pub static HOOK_NAMES: LazyLock<Vec<&'static str>> = LazyLock::new(|| {
    INDEX
        .hook_names
        .iter()
        .map(|s| Box::leak(s.clone().into_boxed_str()) as &'static str)
        .collect()
});

#[derive(Debug, Deserialize)]
pub struct ToolDefs {
    pub version: u32,
    pub tools: Vec<ToolDef>,
    /// Suite-level intent→tool cheat-sheet, rendered into `zshref --help`.
    /// Source: `TOOL_SUITE_PREAMBLE` in `packages/zsh-core-tooldef/src/tool-defs.ts`.
    pub preamble: String,
}

#[derive(Debug, Deserialize)]
pub struct ToolDef {
    pub name: String,
    pub brief: String,
    pub description: String,
    #[serde(rename = "flagBriefs")]
    pub flag_briefs: BTreeMap<String, String>,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
    // Bundled into `zshref schema` and used by schema-validation tests.
    #[serde(rename = "outputSchema")]
    pub output_schema: Value,
}

pub fn load_tool_defs() -> Result<ToolDefs> {
    serde_json::from_slice(TOOLDEF_JSON).context("parsing embedded tooldef.json")
}

/// Decoded `index.json`. Taxonomy lists (`doc_categories`, `classify_order`,
/// `category_files`) come directly from the TS source of truth — no Rust-side mirror.
#[derive(Debug, Deserialize)]
pub struct Index {
    #[allow(dead_code)]
    pub version: u32,
    #[serde(rename = "packageVersion")]
    pub package_version: String,
    #[serde(rename = "zshUpstream")]
    pub zsh_upstream: ZshUpstream,
    #[serde(rename = "docCategories")]
    pub doc_categories: Vec<String>,
    #[serde(rename = "classifyOrder")]
    pub classify_order: Vec<String>,
    #[serde(rename = "categoryFiles")]
    pub category_files: BTreeMap<String, String>,
    /// Hook base names for the special_function resolver (`*_functions` suffix
    /// pattern). Sourced from `packages/zsh-core/src/docs/resolvers.ts`.
    #[serde(rename = "hookNames")]
    pub hook_names: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ZshUpstream {
    pub tag: String,
    pub commit: String,
    pub date: String,
}

pub struct Corpus {
    pub index: &'static Index,
    /// One vec per category in `index.docCategories` order (used by `list`/`search`).
    /// `docs` walks `CLASSIFY_ORDER` instead.
    pub categories: Vec<Category>,
}

pub struct Category {
    pub name: &'static str,
    pub records: Vec<Map<String, Value>>,
}

pub fn load_corpus() -> Result<Corpus> {
    let index: &'static Index = &INDEX;
    let mut categories = Vec::with_capacity(index.doc_categories.len());
    for (i, cat_name) in index.doc_categories.iter().enumerate() {
        let file = index
            .category_files
            .get(cat_name)
            .with_context(|| format!("index.json.categoryFiles missing entry for {cat_name}"))?;
        let bytes = file_bytes(file).with_context(|| {
            format!("no embedded bytes for {file} (referenced by category {cat_name})")
        })?;
        let records: Vec<Map<String, Value>> =
            serde_json::from_slice(bytes).with_context(|| format!("parsing embedded {file}"))?;
        // SAFETY: cat_name comes from index.doc_categories, owned by the
        // 'static INDEX. Promote &str to &'static str via the static ref.
        let static_name: &'static str = DOC_CATEGORIES[i];
        categories.push(Category {
            name: static_name,
            records,
        });
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
    //! Sanity guards on consumed JSON. The taxonomy lists themselves no
    //! longer have Rust-side duplicates to drift against — `DOC_CATEGORIES`
    //! and `CLASSIFY_ORDER` project directly from the embedded
    //! `index.json`, so the only drift surface remaining is the per-record
    //! field shape consumed by `tools::record_fields::record_id`.
    use super::*;

    #[test]
    fn corpus_id_and_display_are_ascii() {
        // `fuzzy::score` is ASCII-only; non-ASCII ids silently score 0.
        // Fail here so corpus drift forces a conscious decision.
        let corpus = load_corpus().expect("load_corpus");
        let mut violations: Vec<String> = Vec::new();
        for cat in &corpus.categories {
            for rec in &cat.records {
                let id = crate::tools::record_fields::record_id(cat.name, rec);
                let display = crate::tools::record_fields::record_display(cat.name, rec);
                if !id.is_ascii() {
                    violations.push(format!("category {}: _id {:?}", cat.name, id));
                }
                if !display.is_ascii() {
                    violations.push(format!("category {}: _display {:?}", cat.name, display));
                }
            }
        }
        assert!(
            violations.is_empty(),
            "non-ASCII _id/_display in corpus — src/fuzzy.rs assumes ASCII:\n  {}",
            violations.join("\n  ")
        );
    }

    #[test]
    fn record_id_key_populated_for_every_category() {
        // If TS stopped emitting `_id`, Rust would silently read "" everywhere.
        let corpus = load_corpus().expect("load_corpus");
        for cat in &corpus.categories {
            let first = cat
                .records
                .first()
                .unwrap_or_else(|| panic!("category {} has zero records", cat.name));
            let id = crate::tools::record_fields::record_id(cat.name, first);
            assert!(
                !id.is_empty(),
                "baked `_id` field is absent or empty for category {} — \
                 packages/zsh-core/build.ts must emit `_id` on every record",
                cat.name
            );
        }
    }
}
