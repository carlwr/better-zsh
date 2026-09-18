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
macro_rules! file_bytes {
    ($($f:literal),* $(,)?) => {
        &[$(($f, include_bytes!(corpus_path!($f)))),*]
    };
}
const FILE_BYTES: &[(&str, &[u8])] = file_bytes![
    "arith_op.json",
    "builtin.json",
    "comp_utility.json",
    "complex_command.json",
    "conditional_op.json",
    "glob_flag.json",
    "glob_op.json",
    "glob_qualifier.json",
    "history_expn.json",
    "job_spec.json",
    "keymap.json",
    "mathfunc.json",
    "option.json",
    "param_expn.json",
    "param_expn_flag.json",
    "precmd_modifier.json",
    "process_subst.json",
    "prompt_escape.json",
    "redirection.json",
    "reserved_word.json",
    "special_function.json",
    "special_param.json",
    "subscript_flag.json",
    "zle_widget.json",
];

fn file_bytes(name: &str) -> Option<&'static [u8]> {
    FILE_BYTES
        .iter()
        .find_map(|(n, b)| (*n == name).then_some(*b))
}

/// The `index.json` shape this crate reads: `JsonIndex.version` in zsh-core.
const INDEX_VERSION: u32 = 2;

/// Parsed `index.json`. Lazy-decoded once; taxonomy statics project from it.
pub static INDEX: LazyLock<Index> = LazyLock::new(|| decode_index(INDEX_JSON));

/// `version` is checked before the rest is decoded, so a stale vendored
/// `data/` fails on the version, not on whichever field moved.
fn decode_index(bytes: &[u8]) -> Index {
    #[derive(Deserialize)]
    struct Versioned {
        version: u32,
    }
    let Versioned { version } =
        serde_json::from_slice(bytes).expect("embedded index.json must parse");
    assert_eq!(
        version, INDEX_VERSION,
        "embedded index.json is version {version}; this crate reads version {INDEX_VERSION} — re-vendor `data/` (DATA-SYNC.md)"
    );
    serde_json::from_slice(bytes).expect("embedded index.json must parse")
}

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
pub struct UnknownCategory(String);

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
    /// One closed JSON Schema per `ResolverFeedback` kind, in zsh-core's
    /// `resolverFeedbackKinds` order — the tool output schemas embed them.
    #[serde(rename = "resolverFeedbackKindSchemas")]
    pub resolver_feedback_kind_schemas: Vec<Value>,
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
// (`_id` / `_display` / `_title` / `_subKind` / `_mdBody`: the projection's
// generated field names, all `_`-prefixed)
impl Record {
    /// `""` when absent or not a string.
    pub fn str(&self, key: &str) -> &str {
        self.0.get(key).and_then(Value::as_str).unwrap_or("")
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

    /// The rendered markdown body; tool output re-keys it as `mdBody`.
    pub fn md_body(&self) -> &str {
        self.str("_mdBody")
    }

    /// `None` for categories whose records carry no `_subKind`.
    pub fn sub_kind(&self) -> Option<&str> {
        let s = self.str("_subKind");
        (!s.is_empty()).then_some(s)
    }

    /// An option record's short-flag aliases (`flags[]`); empty elsewhere.
    pub fn flags(&self) -> impl Iterator<Item = OptFlagAlias<'_>> {
        self.0
            .get("flags")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|f| {
                Some(OptFlagAlias {
                    char: f.get("char")?.as_str()?,
                    on: f.get("on")?.as_str()?,
                    emulations: f.get("emulations")?.as_array()?,
                })
            })
    }
}

// MIRROR-OF: packages/zsh-core/src/docs/types.ts (`OptFlagAlias`)
/// One `flags[]` entry of an option record: the letter, the sign that turns
/// the option on, and the emulation modes whose single-letter table maps the
/// letter to this option (plain zsh is `zsh`).
#[derive(Clone, Copy, Debug)]
pub struct OptFlagAlias<'r> {
    pub char: &'r str,
    pub on: &'r str,
    emulations: &'r [Value],
}

impl OptFlagAlias<'_> {
    pub fn valid_in(&self, emulation: &str) -> bool {
        self.emulations
            .iter()
            .any(|e| e.as_str() == Some(emulation))
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
    use serde_json::json;

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
    fn record_id_and_md_body_keys_populated_for_every_category() {
        // Were zsh-core to rename `_id` or `_mdBody`, the accessors would read
        // "" everywhere.
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
            assert!(
                !first.md_body().is_empty(),
                "baked `_mdBody` field is absent or empty for category {}",
                cat.name
            );
        }
    }

    #[test]
    #[should_panic(expected = "this crate reads version")]
    fn index_of_another_version_fails_loudly() {
        let mut index: Value = serde_json::from_slice(INDEX_JSON).unwrap();
        index["version"] = json!(INDEX_VERSION + 1);
        decode_index(&serde_json::to_vec(&index).unwrap());
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
