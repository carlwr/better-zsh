//! `zsh_search` — port of
//! `packages/zsh-core-tooldef/src/tools/search.ts`.
//!
//! Ranking: exact id/display > resolver (corpus-aware close-variant
//! match, e.g. `au_to_cd` → `autocd`) > prefix > fuzzy. The fuzzy tier
//! composes `crate::fuzzy::score` (in-tree ASCII matcher — no third-party
//! fuzzy dep). Exact / resolver / prefix matches all carry `score: 1.0`;
//! fuzzy matches carry the in-tree scalar mapped into `(0, 1)` (capped
//! strictly below `1.0` so the tier is recoverable from the score alone).
//! `matchesTotal` is reported pre-truncation so callers can detect
//! whether the result was limited. `query` is required (clap-side).

use crate::corpus::Corpus;
use crate::tools::shared::{
    mk_entry, mk_envelope, record_display, record_id, record_sub_kind, resolve_in,
};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::Value;

pub const DEFAULT_LIMIT: u32 = 20;

struct Entry<'c> {
    category: &'c str,
    id: String,
    display: String,
    sub_kind: Option<String>,
}

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    // `query` is required at the clap layer, but treat empty/whitespace
    // here as an empty match set (matches the TS tooldef behavior).
    let query = matches
        .get_one::<String>("query")
        .map(String::as_str)
        .unwrap_or("")
        .trim();
    let category = matches.get_one::<String>("category").cloned();
    let limit = *matches.get_one::<u32>("limit").unwrap_or(&DEFAULT_LIMIT) as usize;

    if query.is_empty() {
        return Ok(mk_envelope(Vec::new(), 0));
    }

    let pool = entries(corpus, category.as_deref());
    let q_low = query.to_ascii_lowercase();

    // Dedup invariant: no two matches share `(category, id)`. The
    // seen-set is maintained across all four tiers (exact / resolver /
    // prefix / fuzzy). Mirrors the TS tooldef.
    let mut seen: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    let key = |e: &Entry| -> (String, String) { (e.category.to_string(), e.id.clone()) };

    let (mut exact, mut prefix, mut rest): (Vec<&Entry>, Vec<&Entry>, Vec<&Entry>) =
        (Vec::new(), Vec::new(), Vec::new());
    for e in &pool {
        let id_low = e.id.to_ascii_lowercase();
        let disp_low = e.display.to_ascii_lowercase();
        if id_low == q_low || disp_low == q_low {
            exact.push(e);
            seen.insert(key(e));
        } else if id_low.starts_with(&q_low) || disp_low.starts_with(&q_low) {
            prefix.push(e);
            seen.insert(key(e));
        } else {
            rest.push(e);
        }
    }

    // Resolver tier: route the query through each category's resolver
    // (option NO_-stripping, redir group-op + tail decomposition,
    // history event-designators, ...). Hits not already bucketed by the
    // exact/prefix pass surface here. Walks `CLASSIFY_ORDER` when the
    // caller didn't pin a category; otherwise just the one.
    let resolver_cats: Vec<&str> = match category.as_deref() {
        Some(c) => vec![c],
        None => crate::corpus::CLASSIFY_ORDER.to_vec(),
    };
    // `(category, id)` → Entry so resolver hits can be matched without
    // re-walking the pool.
    let by_key: std::collections::HashMap<(String, String), &Entry> = pool
        .iter()
        .map(|e| ((e.category.to_string(), e.id.clone()), e))
        .collect();
    let mut resolver_hits: Vec<&Entry> = Vec::new();
    for cat in &resolver_cats {
        if let Some(h) = resolve_in(corpus, cat, query) {
            let k = (h.category.to_string(), h.id.clone());
            if seen.contains(&k) {
                continue;
            }
            if let Some(e) = by_key.get(&k) {
                resolver_hits.push(*e);
                seen.insert(k);
            }
        }
    }

    // Fuzzy tier: score id and display, keep the max (matches TS
    // fuzzysort's `keys: ["id","display"]`). Non-ASCII queries score
    // `None` → no match; pool is ASCII-only per the corpus drift guard.
    // Skip entries already bucketed by earlier tiers.
    let mut fuzzy: Vec<(&Entry, u32)> = rest
        .iter()
        .filter(|e| !seen.contains(&key(e)))
        .filter_map(|e| {
            let s_id = crate::fuzzy::score(query, &e.id).unwrap_or(0);
            let s_disp = crate::fuzzy::score(query, &e.display).unwrap_or(0);
            let s = s_id.max(s_disp);
            (s > 0).then_some((*e, s))
        })
        .collect();
    fuzzy.sort_by_key(|b| std::cmp::Reverse(b.1));

    let total = exact.len() + resolver_hits.len() + prefix.len() + fuzzy.len();
    let ranked = exact
        .iter()
        .chain(resolver_hits.iter())
        .chain(prefix.iter())
        .map(|e| entry_json(e, 1.0))
        .chain(fuzzy.iter().map(|(e, s)| {
            // Map our scalar score into `(0, 1)` for JSON parity with
            // fuzzysort. Exclusive at 1.0 so fuzzy stays distinguishable
            // from the `1.0` exact/resolver/prefix tiers; consumers rely
            // on ranking order, not the absolute value.
            let mapped = (*s as f64 / 1000.0).min(0.999_999);
            entry_json(e, mapped)
        }));
    let returned: Vec<Value> = ranked.take(limit).collect();
    Ok(mk_envelope(returned, total))
}

fn entry_json(e: &Entry, score: f64) -> Value {
    mk_entry(
        e.category,
        e.id.clone(),
        e.display.clone(),
        e.sub_kind.clone(),
        Some(score),
    )
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
                sub_kind: record_sub_kind(cat.name, rec),
            })
        })
        .collect()
}
