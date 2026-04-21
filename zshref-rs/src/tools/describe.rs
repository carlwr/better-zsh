//! `zsh_describe` — port of
//! `packages/zsh-core-tooldef/src/tools/describe.ts`.
//! Direct `{category, id}` lookup with no normalization.

use crate::corpus::Corpus;
use crate::tools::classify::{record_display, record_id, str_arg, str_field};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{json, Value};

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let category = str_arg(matches, "category");
    let id = str_arg(matches, "id");

    let m = corpus.category(category).and_then(|cat| {
        cat.records
            .iter()
            .find(|r| record_id(category, r) == id)
            .map(|r| {
                json!({
                    "category": category,
                    "id": id,
                    "display": record_display(category, r),
                    "markdown": str_field(r, "markdown"),
                })
            })
    });
    Ok(json!({ "match": m.unwrap_or(Value::Null) }))
}
