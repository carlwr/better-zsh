//! `zsh_docs` — zsh key → per-category resolved matches.
//!
//! Without `--category`, walks `CLASSIFY_ORDER` and returns one match per
//! resolving category. Feedback (e.g. `NO_`-stripping → `input-negated`)
//! is forwarded from the per-category resolver.
//
// MIRROR-OF: packages/zsh-core-tooldef/src/tools/docs.ts

use crate::corpus::{Corpus, CLASSIFY_ORDER};
use crate::resolver::{resolve_in, ResolvedHit};
use crate::tools::envelope::mk_envelope;
use crate::tools::record_fields::{record_sub_kind, str_field, str_input};
use anyhow::Result;
use serde_json::{Map, Value};

pub fn run(input: &Value, corpus: &Corpus) -> Result<Value> {
    let key = str_input(input, "key");
    let category = input.get("category").and_then(Value::as_str);

    let matches_vec: Vec<Value> = if key.trim().is_empty() {
        Vec::new()
    } else {
        match category {
            Some(cat) => resolve_in(corpus, cat, key)
                .map(|h| hit_to_match(&h))
                .into_iter()
                .collect(),
            None => CLASSIFY_ORDER
                .iter()
                .filter_map(|cat| {
                    let h = resolve_in(corpus, cat, key)?;
                    if h.category == "history_expn"
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
        m.insert("feedback".into(), fb.to_json());
    }
    Value::Object(m)
}
