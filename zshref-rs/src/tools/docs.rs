//! `zsh_docs` — port of `packages/zsh-core-tooldef/src/tools/docs.ts`.
//!
//! Resolves a raw token via per-category dispatch. Without `--category`
//! walks `crate::corpus::CLASSIFY_ORDER` and returns one match per
//! resolving category. Surfaces lossy-resolution feedback (today: option
//! `NO_`-stripping → `{ kind: "input-negated" }`) on any category whose
//! per-category resolver emits it.

use crate::corpus::{Corpus, CLASSIFY_ORDER};
use crate::tools::shared::{
    mk_envelope, record_sub_kind, resolve_in, str_arg, str_field, ResolvedHit,
};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{json, Map, Value};

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
            None => CLASSIFY_ORDER
                .iter()
                .filter_map(|cat| {
                    let h = resolve_in(corpus, cat, raw)?;
                    if h.category == "history"
                        && record_sub_kind(h.category, h.rec).as_deref() != Some("event-designator")
                    {
                        return None;
                    }
                    Some(hit_to_match(&h))
                })
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
        "mdBody".into(),
        Value::String(str_field(h.rec, "mdBody").to_string()),
    );
    if let Some(sk) = record_sub_kind(h.category, h.rec) {
        m.insert("subKind".into(), Value::String(sk));
    }
    if let Some(fb) = &h.feedback {
        m.insert("feedback".into(), json!({ "kind": fb.kind() }));
    }
    Value::Object(m)
}
