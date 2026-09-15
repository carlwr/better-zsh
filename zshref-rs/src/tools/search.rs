//! `zsh_search` — four-tier ranking: exact > resolver > prefix > fuzzy.
//!
//! Exact/resolver/prefix → `score: 1.0`. Fuzzy tier uses `crate::fuzzy::score`
//! (in-tree ASCII matcher) mapped into `(0, 1)` — strictly below 1.0 so the
//! tier is recoverable from the score. `matchesTotal` is pre-truncation.

use crate::corpus::{Corpus, DocCategory, CLASSIFY_ORDER};
use crate::resolver::resolve_in;
use crate::tools::envelope::{mk_entry, mk_envelope};
use crate::tools::schema::{output_schema, MatchShape, Shape};
use crate::tools::{category_input, prose, Field, Tool, ToolName};
use anyhow::Result;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub fn tool(corpus: &Corpus) -> Tool {
    Tool::new(
        ToolName::Search,
        prose::search(corpus.index),
        vec![
            Field::required("query", prose::query(), Shape::Text),
            Field::optional(
                "category",
                prose::filter_category(corpus.index),
                Shape::Category,
            ),
            Field::optional("limit", prose::limit(), Shape::Limit),
        ],
        output_schema(
            &MatchShape {
                score: true,
                ..MatchShape::default()
            },
            corpus,
        ),
        run,
    )
}

#[derive(Debug)]
struct Entry<'c> {
    category: DocCategory,
    id: &'c str,
    display: &'c str,
    sub_kind: Option<&'c str>,
}

impl<'c> Entry<'c> {
    fn key(&self) -> (DocCategory, &'c str) {
        (self.category, self.id)
    }
}

pub fn run(input: &Value, corpus: &Corpus) -> Result<Value> {
    let query = input
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let category = category_input(input)?;
    let limit = input.get("limit").and_then(Value::as_u64).unwrap_or(0) as usize;

    if query.is_empty() {
        return Ok(mk_envelope(Vec::new(), 0));
    }

    let pool = entries(corpus, category);
    let q_low = query.to_ascii_lowercase();

    let mut seen: HashSet<(DocCategory, &str)> = HashSet::new();

    let (mut exact, mut prefix, mut rest): (Vec<&Entry>, Vec<&Entry>, Vec<&Entry>) =
        (Vec::new(), Vec::new(), Vec::new());
    for e in &pool {
        let id_low = e.id.to_ascii_lowercase();
        let disp_low = e.display.to_ascii_lowercase();
        if id_low == q_low || disp_low == q_low {
            exact.push(e);
            seen.insert(e.key());
        } else if id_low.starts_with(&q_low) || disp_low.starts_with(&q_low) {
            prefix.push(e);
            seen.insert(e.key());
        } else {
            rest.push(e);
        }
    }

    let resolver_cats: Vec<DocCategory> = match category {
        Some(c) => vec![c],
        None => CLASSIFY_ORDER.to_vec(),
    };
    let by_key: HashMap<(DocCategory, &str), &Entry> = pool.iter().map(|e| (e.key(), e)).collect();
    let mut resolver_hits: Vec<&Entry> = Vec::new();
    for &cat in &resolver_cats {
        if let Some(h) = resolve_in(corpus, cat, query) {
            let k = (h.category, h.id);
            if seen.contains(&k) {
                continue;
            }
            if let Some(e) = by_key.get(&k) {
                resolver_hits.push(*e);
                seen.insert(k);
            }
        }
    }

    // A non-ASCII query scores `None`; the pool is ASCII-only (corpus drift guard).
    let mut fuzzy: Vec<(&Entry, u32)> = rest
        .iter()
        .filter(|e| !seen.contains(&e.key()))
        .filter_map(|e| {
            let s_id = crate::fuzzy::score(query, e.id).unwrap_or(0);
            let s_disp = crate::fuzzy::score(query, e.display).unwrap_or(0);
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
            let mapped = (*s as f64 / 1000.0).min(0.999_999);
            entry_json(e, mapped)
        }));
    let returned: Vec<Value> = ranked.take(limit).collect();
    Ok(mk_envelope(returned, total))
}

fn entry_json(e: &Entry, score: f64) -> Value {
    mk_entry(e.category, e.id, e.display, e.sub_kind, Some(score))
}

fn entries(corpus: &Corpus, cat_filter: Option<DocCategory>) -> Vec<Entry<'_>> {
    corpus
        .categories
        .iter()
        .filter(|cat| cat_filter.is_none_or(|f| cat.name == f))
        .flat_map(|cat| {
            cat.records.iter().map(move |rec| Entry {
                category: cat.name,
                id: rec.id(),
                display: rec.display(),
                sub_kind: rec.sub_kind(),
            })
        })
        .collect()
}
