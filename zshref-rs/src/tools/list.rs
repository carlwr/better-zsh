//! `zsh_list` — port of `packages/zsh-core-tooldef/src/tools/list.ts`.
//!
//! Enumerate corpus records, optionally filtered to one category, no
//! markdown body. `limit=0` returns metadata only.

use crate::corpus::Corpus;
use crate::tools::shared::{mk_envelope, record_display, record_id, record_sub_kind};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{Map, Value};

pub const DEFAULT_LIMIT: u32 = 20;

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let category = matches.get_one::<String>("category").cloned();
    let limit = *matches.get_one::<u32>("limit").unwrap_or(&DEFAULT_LIMIT) as usize;

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
            cat.records.iter().map(move |rec| entry_json(cat.name, rec))
        })
        .collect()
}

fn entry_json(cat: &str, rec: &Map<String, Value>) -> Value {
    let mut obj = Map::new();
    obj.insert("category".into(), Value::String(cat.to_string()));
    obj.insert("id".into(), Value::String(record_id(cat, rec)));
    obj.insert("display".into(), Value::String(record_display(cat, rec)));
    if let Some(sk) = record_sub_kind(cat, rec) {
        obj.insert("subKind".into(), Value::String(sk));
    }
    Value::Object(obj)
}
