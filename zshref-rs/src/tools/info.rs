//! `zshref info` — corpus-level introspection as JSON; CLI-only, not in the
//! tool set. Counts are recomputed from the loaded corpus rather than copied
//! from `index.counts` (a second drift surface, with camelCase keys).

use crate::corpus::{Corpus, DocCategory};
use serde_json::{Map, Value, json};

pub fn run(corpus: &Corpus) -> Value {
    let counts: Map<String, Value> = corpus
        .categories
        .iter()
        .map(|c| (c.name.to_string(), Value::from(c.records.len())))
        .collect();
    let categories: Vec<DocCategory> = corpus.categories.iter().map(|c| c.name).collect();

    json!({
        "packageVersion": corpus.index.package_version,
        "dataHash": corpus.index.data_hash,
        "zshUpstream": {
            "tag": corpus.index.zsh_upstream.tag,
            "commit": corpus.index.zsh_upstream.commit,
            "date": corpus.index.zsh_upstream.date,
        },
        "counts": counts,
        "categories": categories,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::load_corpus;

    #[test]
    fn info_json_has_expected_top_level_keys() {
        let corpus = load_corpus().expect("load_corpus");
        let v = run(&corpus);
        let obj = v.as_object().expect("top-level object");
        for key in [
            "packageVersion",
            "dataHash",
            "zshUpstream",
            "counts",
            "categories",
        ] {
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
        let corpus = load_corpus().expect("load_corpus");
        let v = run(&corpus);
        let listed: Vec<&str> = v["categories"]
            .as_array()
            .expect("categories array")
            .iter()
            .map(|x| x.as_str().expect("category is string"))
            .collect();
        let expected: Vec<&str> = corpus.categories.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(listed, expected);
    }

    #[test]
    fn info_counts_nonzero_per_category() {
        // An empty category usually means the JSON artifact failed to regenerate.
        let corpus = load_corpus().expect("load_corpus");
        let v = run(&corpus);
        let counts = v["counts"].as_object().expect("counts object");
        for cat in &corpus.categories {
            let n = counts
                .get(cat.name.as_str())
                .and_then(Value::as_u64)
                .unwrap_or_else(|| panic!("missing counts.{}", cat.name));
            assert!(n > 0, "counts.{} is zero", cat.name);
        }
    }
}
