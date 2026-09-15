//! `zsh_search` — four-tier ranking: exact > resolver > prefix > fuzzy.
//!
//! Exact/resolver/prefix → `score: 1.0`. Fuzzy tier uses `crate::fuzzy::score`
//! (in-tree ASCII matcher) mapped into `(0, 1)` — strictly below 1.0 so the
//! tier is recoverable from the score. `matchesTotal` is pre-truncation.

use crate::corpus::{CLASSIFY_ORDER, Corpus, DocCategory};
use crate::resolver::resolve_in;
use crate::tools::envelope::{Entry, Envelope, entries};
use crate::tools::schema::{MatchShape, Shape, default_limit, output_schema};
use crate::tools::{Field, Tool, ToolName, prose};
use anyhow::Result;
use serde::Deserialize;
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    query: String,
    category: Option<DocCategory>,
    #[serde(default = "default_limit")]
    limit: u32,
}

fn run(input: Input, corpus: &Corpus) -> Result<Value> {
    let query = input.query.trim();
    if query.is_empty() {
        return Envelope::new(Vec::<Entry>::new(), 0).to_value();
    }

    let pool = entries(corpus, input.category);
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

    let resolver_cats: &[DocCategory] = match &input.category {
        Some(c) => std::slice::from_ref(c),
        None => &CLASSIFY_ORDER,
    };
    let by_key: HashMap<(DocCategory, &str), &Entry> = pool.iter().map(|e| (e.key(), e)).collect();
    let mut resolver_hits: Vec<&Entry> = Vec::new();
    for &cat in resolver_cats {
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

    let mut fuzzy: Vec<(&Entry, u32)> = rest
        .iter()
        .filter(|e| !seen.contains(&e.key()))
        .filter_map(|e| {
            crate::fuzzy::score(query, e.id)
                .max(crate::fuzzy::score(query, e.display))
                .map(|s| (*e, s))
        })
        .collect();
    fuzzy.sort_by_key(|b| std::cmp::Reverse(b.1));

    let total = exact.len() + resolver_hits.len() + prefix.len() + fuzzy.len();
    let ranked = exact
        .iter()
        .chain(resolver_hits.iter())
        .chain(prefix.iter())
        .map(|e| scored(e, 1.0))
        .chain(fuzzy.iter().map(|(e, s)| {
            let mapped = (*s as f64 / 1000.0).min(0.999_999);
            scored(e, mapped)
        }));
    let returned: Vec<Entry> = ranked.take(input.limit as usize).collect();
    Envelope::new(returned, total).to_value()
}

fn scored<'c>(e: &Entry<'c>, score: f64) -> Entry<'c> {
    Entry {
        score: Some(score),
        ..*e
    }
}
