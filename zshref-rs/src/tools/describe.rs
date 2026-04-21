//! `zsh_describe` — port of
//! `packages/zsh-core-tooldef/src/tools/describe.ts`.
//! Direct `{category, id}` lookup with no normalization.

use crate::corpus::Corpus;
use crate::tools::classify::{record_display, record_id};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{json, Value};

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let category = matches
        .get_one::<String>("category")
        .map(String::as_str)
        .unwrap_or("");
    let id = matches
        .get_one::<String>("id")
        .map(String::as_str)
        .unwrap_or("");

    let Some(cat) = corpus.category(category) else {
        return Ok(json!({ "match": Value::Null }));
    };
    let Some(rec) = cat.records.iter().find(|r| record_id(category, r) == id) else {
        return Ok(json!({ "match": Value::Null }));
    };
    let markdown = rec
        .get("markdown")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Ok(json!({
        "match": {
            "category": category,
            "id": id,
            "display": record_display(category, rec),
            "markdown": markdown,
        }
    }))
}
