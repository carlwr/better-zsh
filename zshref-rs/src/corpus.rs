//! Corpus JSON decoding.
//!
//! Records stay loose (`serde_json::Value` maps) — forward-compatible with
//! schema additions; the tools read a handful of well-known fields.
//! Taxonomy lists come from the embedded `index.json` (TS source of truth).

use anyhow::{Context, Result};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fmt;
use std::str::FromStr;
use std::sync::LazyLock;

// `build.rs` picks `vendored` (data/) or `monorepo` (sibling TS artifacts); DATA-SYNC.md.
#[cfg(data_source = "vendored")]
macro_rules! corpus_path {
    ($f:literal) => {
        concat!("../data/", $f)
    };
}
#[cfg(data_source = "monorepo")]
macro_rules! corpus_path {
    ($f:literal) => {
        concat!("../../packages/zsh-core/artifacts/json/", $f)
    };
}

/// The resolver conformance fixture released with the corpus. Test input, not
/// embedded: read from the same source the corpus JSONs come from.
#[cfg(test)]
pub fn resolver_fixture_path() -> std::path::PathBuf {
    #[cfg(data_source = "vendored")]
    const REL: &str = "data/resolver-fixture.json";
    #[cfg(data_source = "monorepo")]
    const REL: &str = "../packages/zsh-core/artifacts/resolver-fixture/resolver-fixture.json";
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(REL)
}

const INDEX_JSON: &[u8] = include_bytes!(corpus_path!("index.json"));

// `include_bytes!` takes literal paths: hand-maintained; `load_corpus` checks it vs index.json.
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
    (
        "mathfuncs.json",
        include_bytes!(corpus_path!("mathfuncs.json")),
    ),
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

fn leak(s: &str) -> &'static str {
    Box::leak(s.to_owned().into_boxed_str())
}

/// A name from the closed `DocCategory` union in `index.json`. `FromStr`
/// is the only constructor, so a value always names a loaded category.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct DocCategory(&'static str);

impl DocCategory {
    pub fn as_str(self) -> &'static str {
        self.0
    }
}

/// `DocCategory::from_str` rejection: the name is not in `index.json`.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct UnknownCategory(pub String);

impl fmt::Display for UnknownCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown category `{}`", self.0)
    }
}

impl std::error::Error for UnknownCategory {}

impl FromStr for DocCategory {
    type Err = UnknownCategory;

    fn from_str(s: &str) -> Result<Self, UnknownCategory> {
        DOC_CATEGORIES
            .iter()
            .copied()
            .find(|c| c.0 == s)
            .ok_or_else(|| UnknownCategory(s.to_owned()))
    }
}

impl fmt::Display for DocCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.pad(self.0)
    }
}

impl Serialize for DocCategory {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.0)
    }
}

impl<'de> Deserialize<'de> for DocCategory {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer)?
            .parse()
            .map_err(serde::de::Error::custom)
    }
}

/// The closed `DocCategory` union in `index.json` order. Names are leaked
/// once so a `DocCategory` is `Copy` and `'static`.
pub static DOC_CATEGORIES: LazyLock<Vec<DocCategory>> = LazyLock::new(|| {
    INDEX
        .doc_categories
        .iter()
        .map(|s| DocCategory(leak(s)))
        .collect()
});

/// Resolver-walk order (`index.json.classifyOrder`).
pub static CLASSIFY_ORDER: LazyLock<Vec<DocCategory>> = LazyLock::new(|| {
    INDEX
        .classify_order
        .iter()
        .map(|s| {
            s.parse()
                .expect("index.json.classifyOrder names a docCategories entry")
        })
        .collect()
});

/// Hook base names for the special_function resolver (`index.json.hookNames`).
pub static HOOK_NAMES: LazyLock<Vec<&'static str>> =
    LazyLock::new(|| INDEX.hook_names.iter().map(|s| leak(s)).collect());

/// Decoded `index.json`. Taxonomy lists (`doc_categories`, `classify_order`,
/// `category_files`) come directly from the TS source of truth — no Rust-side mirror.
#[derive(Debug, Deserialize)]
pub struct Index {
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
    /// Corpus-content identity, independent of `package_version`.
    #[serde(rename = "dataHash")]
    pub data_hash: String,
    /// Human-readable per-category labels. SoT: `docCategoryLabels` in
    /// `packages/zsh-core/src/docs/taxonomy.ts`.
    #[serde(rename = "docCategoryLabels")]
    pub doc_category_labels: BTreeMap<String, String>,
    /// Hook base names for the special_function resolver (`*_functions` suffix
    /// pattern). Sourced from `packages/zsh-core/src/docs/resolver.ts`.
    #[serde(rename = "hookNames")]
    pub hook_names: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ZshUpstream {
    pub tag: String,
    pub commit: String,
    pub date: String,
}

#[derive(Debug)]
pub struct Corpus {
    pub index: &'static Index,
    /// One per `DOC_CATEGORIES` entry, same order (`list`/`search` walk
    /// this; `docs` walks `CLASSIFY_ORDER`).
    pub categories: Vec<Category>,
}

#[derive(Debug)]
pub struct Category {
    pub name: DocCategory,
    pub records: Vec<Record>,
}

/// One corpus record: the baked JSON object, read by field.
#[derive(Clone, Debug, Deserialize)]
#[serde(transparent)]
pub struct Record(Map<String, Value>);

// MIRROR-OF: packages/zsh-core/src/docs/json-projection.ts
// (`_id` / `_display` / `_subKind` / `_title` are the projection's field names)
impl Record {
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.0.get(key)
    }

    /// `""` when absent or not a string.
    pub fn str(&self, key: &str) -> &str {
        self.get(key).and_then(Value::as_str).unwrap_or("")
    }

    pub fn id(&self) -> &str {
        self.str("_id")
    }

    pub fn display(&self) -> &str {
        self.str("_display")
    }

    pub fn title(&self) -> &str {
        self.str("_title")
    }

    pub fn md_body(&self) -> &str {
        self.str("mdBody")
    }

    /// `None` for categories without a `docSubKind`.
    pub fn sub_kind(&self) -> Option<&str> {
        let s = self.str("_subKind");
        (!s.is_empty()).then_some(s)
    }
}

pub fn load_corpus() -> Result<Corpus> {
    let index: &'static Index = &INDEX;
    let mut categories = Vec::with_capacity(DOC_CATEGORIES.len());
    for &name in DOC_CATEGORIES.iter() {
        let file = index
            .category_files
            .get(name.as_str())
            .with_context(|| format!("index.json.categoryFiles missing entry for {name}"))?;
        let bytes = file_bytes(file).with_context(|| {
            format!("no embedded bytes for {file} (referenced by category {name})")
        })?;
        let records: Vec<Record> =
            serde_json::from_slice(bytes).with_context(|| format!("parsing embedded {file}"))?;
        categories.push(Category { name, records });
    }
    Ok(Corpus { index, categories })
}

impl Corpus {
    /// Total: `load_corpus` builds one `Category` per `DOC_CATEGORIES` entry.
    pub fn category(&self, name: DocCategory) -> &Category {
        self.categories
            .iter()
            .find(|c| c.name == name)
            .unwrap_or_else(|| panic!("category {name} not loaded"))
    }
}

#[cfg(test)]
mod tests {
    //! Sanity guards on the consumed JSON: the taxonomy lists project from
    //! `index.json`, so the per-record field shape is the drift surface.
    use super::*;

    #[test]
    fn corpus_id_and_display_are_ascii() {
        // `fuzzy::score` is ASCII-only; a non-ASCII id would silently score 0.
        let corpus = load_corpus().expect("load_corpus");
        let mut violations: Vec<String> = Vec::new();
        for cat in &corpus.categories {
            for rec in &cat.records {
                if !rec.id().is_ascii() {
                    violations.push(format!("category {}: _id {:?}", cat.name, rec.id()));
                }
                if !rec.display().is_ascii() {
                    violations.push(format!(
                        "category {}: _display {:?}",
                        cat.name,
                        rec.display()
                    ));
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
        // Were zsh-core to stop emitting `_id`, `Record::id` would read "" everywhere.
        let corpus = load_corpus().expect("load_corpus");
        for cat in &corpus.categories {
            let first = cat
                .records
                .first()
                .unwrap_or_else(|| panic!("category {} has no records", cat.name));
            assert!(
                !first.id().is_empty(),
                "baked `_id` field is absent or empty for category {}",
                cat.name
            );
        }
    }

    #[test]
    fn doc_category_round_trips_and_rejects_unknown_names() {
        for &cat in DOC_CATEGORIES.iter() {
            assert_eq!(cat.as_str().parse(), Ok(cat));
            assert_eq!(cat.to_string(), cat.as_str());
            let json = serde_json::to_value(cat).unwrap();
            assert_eq!(json, Value::String(cat.as_str().to_owned()));
            assert_eq!(serde_json::from_value::<DocCategory>(json).unwrap(), cat);
        }
        let want = "unknown category `bogus`";
        assert_eq!(
            "bogus".parse::<DocCategory>().unwrap_err().to_string(),
            want
        );
        let err = serde_json::from_value::<DocCategory>(Value::String("bogus".into())).unwrap_err();
        assert_eq!(err.to_string(), want);
        assert!(CLASSIFY_ORDER.iter().all(|c| DOC_CATEGORIES.contains(c)));
    }
}
