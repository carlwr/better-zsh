//! `zsh_list` — port of `packages/zsh-core-tooldef/src/tools/list.ts`.
//!
//! Enumerate corpus records, optionally filtered to one category, no
//! markdown body. `limit=0` returns metadata only.

use crate::corpus::Corpus;
use crate::tools::shared::{mk_entry, mk_envelope, record_display, record_id, record_sub_kind};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::Value;

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let category = matches.get_one::<String>("category").cloned();
    // Default is baked into the clap arg from inputSchema.properties.limit.default.
    let limit = *matches.get_one::<u32>("limit").unwrap_or(&0) as usize;

    let pool = entries(corpus, category.as_deref());
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
