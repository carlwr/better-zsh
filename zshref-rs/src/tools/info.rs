//! `zshref info` — emit build-/corpus-level introspection as JSON.
//!
//! Unlike the other tools, `info` has no `ToolDef` (it's a CLI-only feature,
//! not surfaced through the MCP seam) and takes no input flags. The shape is
//! stable but deliberately minimal; add fields here rather than scatter new
//! `--version`-adjacent subcommands.
//!
//! Counts are recomputed from the loaded corpus (per category `records.len()`)
//! rather than copied from `index.counts`: the corpus is the authoritative
//! record source, and recomputing avoids a second drift surface (the camelCase
//! key shape of `index.counts` differs from our snake_case category names).

use crate::corpus::Corpus;
use anyhow::Result;
use serde_json::{json, Map, Value};

pub fn run(corpus: &Corpus) -> Result<Value> {
    let mut counts = Map::new();
    for cat in &corpus.categories {
        counts.insert(
            cat.name.to_string(),
            Value::from(u64::try_from(cat.records.len()).unwrap_or(u64::MAX)),
        );
    }
    let categories: Vec<Value> = corpus
        .categories
        .iter()
        .map(|c| Value::String(c.name.to_string()))
        .collect();

    Ok(json!({
        "packageVersion": corpus.index.package_version,
        "zshUpstream": {
            "tag": corpus.index.zsh_upstream.tag,
            "commit": corpus.index.zsh_upstream.commit,
            "date": corpus.index.zsh_upstream.date,
        },
        "counts": Value::Object(counts),
        "categories": categories,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::load_corpus;

    #[test]
    fn info_json_has_expected_top_level_keys() {
        let corpus = load_corpus().expect("load_corpus");
        let v = run(&corpus).expect("info::run");
        let obj = v.as_object().expect("top-level object");
        for key in ["packageVersion", "zshUpstream", "counts", "categories"] {
            assert!(
                obj.contains_key(key),
                "missing top-level key {key:?} in {v:?}"
            );
        }
        let upstream = obj["zshUpstream"].as_object().expect("zshUpstream object");
        for key in ["tag", "commit", "date"] {
            assert!(
                upstream.contains_key(key),
                "missing zshUpstream.{key} in {v:?}"
            );
        }
    }

    #[test]
    fn info_categories_match_corpus_order() {
        // `categories` must mirror `docCategories` order (== `CATEGORY_FILES`
        // order in corpus.rs). Guards against future refactors reordering
        // either side.
        let corpus = load_corpus().expect("load_corpus");
        let v = run(&corpus).expect("info::run");
        let listed: Vec<&str> = v["categories"]
            .as_array()
            .expect("categories array")
            .iter()
            .map(|x| x.as_str().expect("category is string"))
            .collect();
        let expected: Vec<&str> = corpus.categories.iter().map(|c| c.name).collect();
        assert_eq!(listed, expected);
    }

    #[test]
    fn info_counts_nonzero_per_category() {
        // Smoke: every bundled category has ≥ 1 record. An empty category
        // would usually mean the JSON artifact failed to regenerate.
        let corpus = load_corpus().expect("load_corpus");
        let v = run(&corpus).expect("info::run");
        let counts = v["counts"].as_object().expect("counts object");
        for cat in &corpus.categories {
            let n = counts
                .get(cat.name)
                .and_then(Value::as_u64)
                .unwrap_or_else(|| panic!("missing counts.{}", cat.name));
            assert!(n > 0, "counts.{} is zero", cat.name);
        }
    }
}
