//! `zsh_lookup_option` — port of
//! `packages/zsh-core-tooldef/src/tools/lookup-option.ts`.
//! Preserves `NO_*` negation: literal match first, then `NO_*` strip.

use crate::corpus::Corpus;
use crate::tools::classify::{
    normalize_option, record_display, record_id, str_arg, str_field, strip_no_prefix,
};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{json, Value};

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    // Shape parity with `lookupOption` in the TS source: `category` is
    // implicit (always "option") and deliberately omitted from the output.
    let raw = str_arg(matches, "raw");
    let m = resolve(corpus, raw).map(|(id, display, markdown, negated)| {
        json!({ "id": id, "display": display, "negated": negated, "markdown": markdown })
    });
    Ok(json!({ "match": m.unwrap_or(Value::Null) }))
}

fn resolve(corpus: &Corpus, raw: &str) -> Option<(String, String, String, bool)> {
    let cat = corpus.category("option")?;
    let find = |norm: &str, negated: bool| {
        cat.records
            .iter()
            .find(|r| record_id("option", r) == norm)
            .map(|r| {
                (
                    norm.to_string(),
                    record_display("option", r),
                    str_field(r, "markdown").to_string(),
                    negated,
                )
            })
    };
    find(&normalize_option(raw), false)
        .or_else(|| find(&normalize_option(&strip_no_prefix(raw)?), true))
}
