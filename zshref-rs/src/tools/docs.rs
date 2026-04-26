//! `zsh_docs` — port of `packages/zsh-core-tooldef/src/tools/docs.ts`.
//!
//! Resolves a raw token via per-category dispatch. Without `--category`
//! walks `crate::corpus::CLASSIFY_ORDER` and returns one match per
//! resolving category. Surfaces `negated` on every option-category match.

use crate::corpus::Corpus;
use crate::tools::shared::{mk_envelope, resolve_in, str_arg, str_field, ResolvedHit};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{Map, Value};

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let raw = str_arg(matches, "raw");
    let category = matches.get_one::<String>("category").map(String::as_str);

    let matches_vec: Vec<Value> = if raw.trim().is_empty() {
        Vec::new()
    } else {
        match category {
            Some(cat) => resolve_in(corpus, cat, raw)
                .map(|h| hit_to_match(&h))
                .into_iter()
                .collect(),
            None => crate::corpus::CLASSIFY_ORDER
                .iter()
                .filter_map(|cat| resolve_in(corpus, cat, raw).map(|h| hit_to_match(&h)))
                .collect(),
        }
    };

    let n = matches_vec.len();
    Ok(mk_envelope(matches_vec, n))
}

fn hit_to_match(h: &ResolvedHit<'_>) -> Value {
    let mut m = Map::new();
    m.insert("category".into(), Value::String(h.category.to_string()));
    m.insert("id".into(), Value::String(h.id.clone()));
    m.insert("display".into(), Value::String(h.display.clone()));
    m.insert(
        "markdown".into(),
        Value::String(str_field(h.rec, "markdown").to_string()),
    );
    if let Some(n) = h.negated {
        m.insert("negated".into(), Value::Bool(n));
    }
    Value::Object(m)
}
