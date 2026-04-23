//! `zsh_search` — port of
//! `packages/zsh-core-tooldef/src/tools/search.ts`.
//!
//! Ranking: exact id/display > prefix > fuzzy. The fuzzy tier composes
//! `crate::fuzzy::score` (in-tree ASCII matcher — no third-party fuzzy
//! dep). `matchesTotal` is reported pre-truncation so callers can
//! detect whether the result was limited.

use crate::corpus::Corpus;
use crate::tools::classify::{record_display, record_id, str_field};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{json, Map, Value};

pub const DEFAULT_LIMIT: u32 = 20;
pub const MAX_LIMIT: u32 = 500;

struct Entry<'c> {
    category: &'c str,
    id: String,
    display: String,
    sub_kind: Option<String>,
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
    // fuzzysort `keys: ["id","display"]` semantics). Non-ASCII queries
    // fall through here as `None` → no fuzzy match; the pool has already
    // been filtered for ASCII by the corpus drift guard.
    let mut fuzzy: Vec<(&Entry, u32)> = rest
        .iter()
        .filter_map(|e| {
            let s_id = crate::fuzzy::score(query, &e.id).unwrap_or(0);
            let s_disp = crate::fuzzy::score(query, &e.display).unwrap_or(0);
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
            // Map our scalar score into an informational [0,1] band for
            // JSON parity with fuzzysort's reciprocal scores. Consumers
            // rely on ranking order, not this absolute value.
            entry_json(e, Some((*s as f64 / 1000.0).min(1.0)))
        }));
    Ok(assemble(ranked.take(limit), total))
}

fn entry_json(e: &Entry, score: Option<f64>) -> Value {
    let mut obj = Map::new();
    obj.insert("category".into(), Value::String(e.category.to_string()));
    obj.insert("id".into(), Value::String(e.id.clone()));
    obj.insert("display".into(), Value::String(e.display.clone()));
    // `subKind` ordering: TS emits it between `display` and `score`. Insert
    // here to mirror byte-for-byte (serde_json::Map preserves insertion order).
    if let Some(sk) = &e.sub_kind {
        obj.insert("subKind".into(), Value::String(sk.clone()));
    }
    if let Some(s) = score {
        obj.insert(
            "score".into(),
            Value::Number(serde_json::Number::from_f64(s).expect("score finite")),
        );
    }
    Value::Object(obj)
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
                sub_kind: record_sub_kind(cat.name, rec),
            })
        })
        .collect()
}

/// Per-category typed sub-facet. Mirror of `docSubKind` in
/// `packages/zsh-core/src/docs/taxonomy.ts`. Categories with no meaningful
/// subKind return `None`; absent-or-empty fields also return `None` so the
/// JSON omits the key (matches TS `undefined`-drop behaviour).
fn record_sub_kind(cat_name: &str, rec: &Map<String, Value>) -> Option<String> {
    let key = match cat_name {
        "cond_op" => "arity",
        "reserved_word" => "pos",
        "param_expn" => "subKind",
        "history" | "glob_op" | "zle_widget" => "kind",
        _ => return None,
    };
    let s = str_field(rec, key);
    (!s.is_empty()).then(|| s.to_string())
}
