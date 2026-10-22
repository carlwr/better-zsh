//! `zshref info` — version and lexicon-level introspection as JSON; CLI-only,
//! not in the tool set. Each version key names whose version it is: the binary
//! (`zshrefVersion`) and the zsh-lexicon release its lexicon comes from
//! (`zshLexiconVersion`). Counts come from the loaded lexicon; `index.json`
//! carries none.

use crate::lexicon::{DocCategory, Lexicon};
use serde_json::{Map, Value, json};

pub fn run(lexicon: &Lexicon) -> Value {
    let counts: Map<String, Value> = lexicon
        .categories
        .iter()
        .map(|c| (c.name.to_string(), Value::from(c.records.len())))
        .collect();
    let categories: Vec<DocCategory> = lexicon.categories.iter().map(|c| c.name).collect();

    json!({
        "zshrefVersion": env!("CARGO_PKG_VERSION"),
        "zshLexiconVersion": lexicon.index.package_version,
        "dataHash": lexicon.index.data_hash,
        "zshUpstream": {
            "tag": lexicon.index.zsh_upstream.tag,
            "commit": lexicon.index.zsh_upstream.commit,
            "date": lexicon.index.zsh_upstream.date,
        },
        "counts": counts,
        "categories": categories,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexicon::load_lexicon;

    #[test]
    fn info_json_has_expected_top_level_keys() {
        let lexicon = load_lexicon().expect("load_lexicon");
        let v = run(&lexicon);
        let obj = v.as_object().expect("top-level object");
        for key in [
            "zshrefVersion",
            "zshLexiconVersion",
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
    fn info_categories_match_lexicon_order() {
        let lexicon = load_lexicon().expect("load_lexicon");
        let v = run(&lexicon);
        let listed: Vec<&str> = v["categories"]
            .as_array()
            .expect("categories array")
            .iter()
            .map(|x| x.as_str().expect("category is string"))
            .collect();
        let expected: Vec<&str> = lexicon.categories.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(listed, expected);
    }

    #[test]
    fn info_counts_nonzero_per_category() {
        // An empty category usually means the JSON artifact failed to regenerate.
        let lexicon = load_lexicon().expect("load_lexicon");
        let v = run(&lexicon);
        let counts = v["counts"].as_object().expect("counts object");
        for cat in &lexicon.categories {
            let n = counts
                .get(cat.name.as_str())
                .and_then(Value::as_u64)
                .unwrap_or_else(|| panic!("missing counts.{}", cat.name));
            assert!(n > 0, "counts.{} is zero", cat.name);
        }
    }
}
