//! `zsh_list` — enumerate corpus records (no `mdBody`), optional category filter.
//! `limit=0` → metadata only (`matchesTotal` nonzero, `matches` empty).
//
// MIRROR-OF: packages/zsh-core-tooldef/src/tools/list.ts

use crate::corpus::Corpus;
use crate::tools::envelope::{mk_entry, mk_envelope};
use crate::tools::record_fields::{record_display, record_id, record_sub_kind};
use anyhow::Result;
use serde_json::Value;

pub fn run(input: &Value, corpus: &Corpus) -> Result<Value> {
    let category = input.get("category").and_then(Value::as_str);
    // Default is baked into the clap arg from inputSchema.properties.limit.default.
    let limit = input.get("limit").and_then(Value::as_u64).unwrap_or(0) as usize;

    let pool = entries(corpus, category);
    let total = pool.len();
    let matches: Vec<Value> = pool.into_iter().take(limit).collect();
    Ok(mk_envelope(matches, total))
}

fn entries(corpus: &Corpus, cat_filter: Option<&str>) -> Vec<Value> {
    corpus
        .categories
        .iter()
        .filter(|cat| cat_filter.is_none_or(|f| cat.name == f))
        .flat_map(|cat| {
            cat.records.iter().map(move |rec| {
                mk_entry(
                    cat.name,
                    record_id(cat.name, rec),
                    record_display(cat.name, rec),
                    record_sub_kind(cat.name, rec),
                    None,
                )
            })
        })
        .collect()
}
