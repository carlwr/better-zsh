//! `zsh_search` — four-tier ranking: exact > resolver > prefix > fuzzy.
//!
//! Exact/resolver/prefix → `score: 1.0`. Fuzzy tier uses `crate::fuzzy::score`
//! (in-tree ASCII matcher) mapped into `(0, 1)` — strictly below 1.0 so the
//! tier is recoverable from the score. `matchesTotal` is pre-truncation.

use crate::corpus::Corpus;
use crate::tools::shared::{
    mk_entry, mk_envelope, record_display, record_id, record_sub_kind, resolve_in,
};
use anyhow::Result;
use serde_json::Value;

struct Entry<'c> {
    category: &'c str,
    id: String,
    display: String,
    sub_kind: Option<String>,
}

pub fn run(input: &Value, corpus: &Corpus) -> Result<Value> {
    // `query` is required upstream; empty/whitespace → empty matches (matches TS).
    let query = input
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let category = input.get("category").and_then(Value::as_str);
    // Default is baked into the clap arg from inputSchema.properties.limit.default.
    let limit = input.get("limit").and_then(Value::as_u64).unwrap_or(0) as usize;

    if query.is_empty() {
        return Ok(mk_envelope(Vec::new(), 0));
    }

    let pool = entries(corpus, category);
    let q_low = query.to_ascii_lowercase();

    // Dedup: seen-set across all four tiers; mirrors the TS tooldef.
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

    // Resolver tier: per-category resolver (NO_-strip, redir decomp, history, …).
    // Hits not yet bucketed by exact/prefix. Walks `CLASSIFY_ORDER` unless pinned.
    let resolver_cats: Vec<&str> = match category {
        Some(c) => vec![c],
        None => crate::corpus::CLASSIFY_ORDER.to_vec(),
    };
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

    // Fuzzy tier: max(score(id), score(display)), mirrors fuzzysort `keys`.
    // Non-ASCII queries score None; pool is ASCII-only per drift guard.
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
            // Map into (0, 1) — exclusive at 1.0 so fuzzy is distinguishable
            // from exact/resolver/prefix tiers in JSON output.
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
