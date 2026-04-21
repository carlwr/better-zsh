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
use nucleo_matcher::{Config, Matcher};
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
    let limit = *matches
        .get_one::<u32>("limit")
        .unwrap_or(&DEFAULT_LIMIT);
    let limit = limit.clamp(1, MAX_LIMIT) as usize;

    let pool = entries(corpus, category.as_deref());

    if query.is_empty() {
        let matches_total = pool.len();
        let matches_arr: Vec<Value> = pool
            .iter()
            .take(limit)
            .map(|e| {
                json!({
                    "category": e.category,
                    "id": e.id,
                    "display": e.display,
                })
            })
            .collect();
        return Ok(json!({
            "matches": matches_arr,
            "matchesReturned": matches_arr.len(),
            "matchesTotal": matches_total,
        }));
    }

    let q_low = query.to_ascii_lowercase();
    let mut exact: Vec<&Entry> = Vec::new();
    let mut prefix: Vec<&Entry> = Vec::new();
    let mut rest: Vec<&Entry> = Vec::new();
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

    // Fuzzy tier: run the matcher over `rest`; score against whichever of
    // id/display produces the higher score, like the TS `keys: ["id",
    // "display"]` config in fuzzysort.
    let mut matcher = Matcher::new(Config::DEFAULT);
    let pat = Pattern::parse(query, CaseMatching::Ignore, Normalization::Smart);
    let mut fuzzy_hits: Vec<(&Entry, u32)> = Vec::new();
    for e in &rest {
        let s_id = pat
            .score(
                nucleo_matcher::Utf32Str::Ascii(e.id.as_bytes()),
                &mut matcher,
            )
            .unwrap_or(0);
        let s_disp = pat
            .score(
                nucleo_matcher::Utf32Str::Ascii(e.display.as_bytes()),
                &mut matcher,
            )
            .unwrap_or(0);
        let s = s_id.max(s_disp);
        if s > 0 {
            fuzzy_hits.push((e, s));
        }
    }
    // Higher score first.
    fuzzy_hits.sort_by(|a, b| b.1.cmp(&a.1));

    let matches_total = exact.len() + prefix.len() + fuzzy_hits.len();

    let mut out: Vec<Value> = Vec::with_capacity(limit.min(matches_total));
    for e in exact.iter().take(limit) {
        out.push(json!({
            "category": e.category,
            "id": e.id,
            "display": e.display,
        }));
    }
    for e in prefix.iter() {
        if out.len() >= limit {
            break;
        }
        out.push(json!({
            "category": e.category,
            "id": e.id,
            "display": e.display,
        }));
    }
    if out.len() < limit {
        let remaining = limit - out.len();
        for (e, s) in fuzzy_hits.iter().take(remaining) {
            // Map nucleo's integer score into a loose [0,1] band for JSON
            // parity with fuzzysort. The absolute value is informational —
            // consumers rely on ranking, not on this scalar.
            let score = (*s as f64 / 1000.0).min(1.0);
            out.push(json!({
                "category": e.category,
                "id": e.id,
                "display": e.display,
                "score": score,
            }));
        }
    }

    let returned = out.len();
    Ok(json!({
        "matches": out,
        "matchesReturned": returned,
        "matchesTotal": matches_total,
    }))
}

fn entries<'c>(corpus: &'c Corpus, cat_filter: Option<&str>) -> Vec<Entry<'c>> {
    let mut out = Vec::new();
    for cat in &corpus.categories {
        if let Some(f) = cat_filter {
            if cat.name != f {
                continue;
            }
        }
        for rec in &cat.records {
            out.push(Entry {
                category: cat.name,
                id: record_id(cat.name, rec),
                display: record_display(cat.name, rec),
            });
        }
    }
    out
}
