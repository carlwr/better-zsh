//! `zsh_search` — port of
//! `packages/zsh-core-tooldef/src/tools/search.ts`.
//!
//! Ranking: exact id/display > prefix > fuzzy. Uses `nucleo-matcher` for
//! the fuzzy tier. `matchesTotal` is reported pre-truncation so callers
//! can detect whether the result was limited.

use crate::corpus::Corpus;
use crate::tools::classify::{record_display, record_id};
use anyhow::Result;
use clap::ArgMatches;
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde_json::{json, Value};

pub const DEFAULT_LIMIT: u32 = 20;
pub const MAX_LIMIT: u32 = 500;

struct Entry<'c> {
    category: &'c str,
    id: String,
    display: String,
}

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let query = matches
        .get_one::<String>("query")
        .map(String::as_str)
        .unwrap_or("")
        .trim();
    let category = matches.get_one::<String>("category").cloned();
    let limit = *matches.get_one::<u32>("limit").unwrap_or(&DEFAULT_LIMIT);
    let limit = limit.clamp(1, MAX_LIMIT) as usize;

    let pool = entries(corpus, category.as_deref());

    if query.is_empty() {
        return Ok(assemble(
            pool.iter().take(limit).map(|e| entry_json(e, None)),
            pool.len(),
        ));
    }

    let q_low = query.to_ascii_lowercase();
    let (mut exact, mut prefix, mut rest): (Vec<&Entry>, Vec<&Entry>, Vec<&Entry>) =
        (Vec::new(), Vec::new(), Vec::new());
    for e in &pool {
        let id_low = e.id.to_ascii_lowercase();
        let disp_low = e.display.to_ascii_lowercase();
        if id_low == q_low || disp_low == q_low {
            exact.push(e);
        } else if id_low.starts_with(&q_low) || disp_low.starts_with(&q_low) {
            prefix.push(e);
        } else {
            rest.push(e);
        }
    }

    // Fuzzy tier: score each of id/display, keep the max (matches the TS
    // fuzzysort `keys: ["id","display"]` semantics).
    let mut matcher = Matcher::new(Config::DEFAULT);
    let pat = Pattern::parse(query, CaseMatching::Ignore, Normalization::Smart);
    let mut fuzzy: Vec<(&Entry, u32)> = rest
        .iter()
        .filter_map(|e| {
            let s_id = pat
                .score(Utf32Str::Ascii(e.id.as_bytes()), &mut matcher)
                .unwrap_or(0);
            let s_disp = pat
                .score(Utf32Str::Ascii(e.display.as_bytes()), &mut matcher)
                .unwrap_or(0);
            let s = s_id.max(s_disp);
            (s > 0).then_some((*e, s))
        })
        .collect();
    fuzzy.sort_by_key(|b| std::cmp::Reverse(b.1));

    let total = exact.len() + prefix.len() + fuzzy.len();
    let ranked = exact
        .iter()
        .chain(prefix.iter())
        .map(|e| entry_json(e, None))
        .chain(fuzzy.iter().map(|(e, s)| {
            // Map nucleo's integer score into a loose [0,1] band for JSON
            // parity with fuzzysort. The absolute value is informational;
            // consumers rely on ranking, not on this scalar.
            entry_json(e, Some((*s as f64 / 1000.0).min(1.0)))
        }));
    Ok(assemble(ranked.take(limit), total))
}

fn entry_json(e: &Entry, score: Option<f64>) -> Value {
    match score {
        None => json!({ "category": e.category, "id": e.id, "display": e.display }),
        Some(s) => {
            json!({ "category": e.category, "id": e.id, "display": e.display, "score": s })
        }
    }
}

fn assemble(items: impl Iterator<Item = Value>, total: usize) -> Value {
    let matches: Vec<Value> = items.collect();
    json!({
        "matches": matches,
        "matchesReturned": matches.len(),
        "matchesTotal": total,
    })
}

fn entries<'c>(corpus: &'c Corpus, cat_filter: Option<&str>) -> Vec<Entry<'c>> {
    corpus
        .categories
        .iter()
        .filter(|cat| cat_filter.is_none_or(|f| cat.name == f))
        .flat_map(|cat| {
            cat.records.iter().map(move |rec| Entry {
                category: cat.name,
                id: record_id(cat.name, rec),
                display: record_display(cat.name, rec),
            })
        })
        .collect()
}
