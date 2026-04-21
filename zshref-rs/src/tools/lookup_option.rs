//! `zsh_lookup_option` — port of
//! `packages/zsh-core-tooldef/src/tools/lookup-option.ts`.
//! Preserves `NO_*` negation: literal match first, then `NO_*` strip.

use crate::corpus::Corpus;
use crate::tools::classify::{normalize_option, record_display};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{json, Value};

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let raw = matches
        .get_one::<String>("raw")
        .map(String::as_str)
        .unwrap_or("");
    // Shape parity with `lookupOption` in
    // `packages/zsh-core-tooldef/src/tools/lookup-option.ts`: the `category`
    // is implicit (always "option") and deliberately omitted.
    Ok(match resolve_option(corpus, raw) {
        Some((id, display, markdown, negated)) => json!({
            "match": {
                "id": id,
                "display": display,
                "negated": negated,
                "markdown": markdown,
            }
        }),
        None => json!({ "match": Value::Null }),
    })
}

fn resolve_option(
    corpus: &Corpus,
    raw: &str,
) -> Option<(String, String, String, bool)> {
    let cat = corpus.category("option")?;
    let literal = normalize_option(raw);
    if let Some(rec) = cat.records.iter().find(|r| option_name(r) == literal) {
        return Some((
            literal,
            record_display("option", rec),
            markdown_of(rec),
            false,
        ));
    }
    let trimmed = raw.trim();
    let lower = trimmed.to_ascii_lowercase();
    let stripped_raw = if let Some(rest) = lower.strip_prefix("no_") {
        Some(rest.to_string())
    } else {
        lower.strip_prefix("no").map(str::to_string)
    }?;
    let stripped = normalize_option(&stripped_raw);
    if let Some(rec) = cat.records.iter().find(|r| option_name(r) == stripped) {
        return Some((
            stripped,
            record_display("option", rec),
            markdown_of(rec),
            true,
        ));
    }
    None
}

fn option_name(rec: &serde_json::Map<String, Value>) -> String {
    rec.get("name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn markdown_of(rec: &serde_json::Map<String, Value>) -> String {
    rec.get("markdown")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}
