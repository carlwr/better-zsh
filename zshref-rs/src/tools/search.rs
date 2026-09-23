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
use std::collections::HashSet;

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
    let starts_with_q = |s: &str| {
        s.get(..query.len())
            .is_some_and(|p| p.eq_ignore_ascii_case(query))
    };

    let (mut exact, mut prefix, mut rest): (Vec<&Entry>, Vec<&Entry>, Vec<&Entry>) =
        (Vec::new(), Vec::new(), Vec::new());
    for e in &pool {
        if e.id.eq_ignore_ascii_case(query) || e.display.eq_ignore_ascii_case(query) {
            exact.push(e);
        } else if starts_with_q(e.id) || starts_with_q(e.display) {
            prefix.push(e);
        } else {
            rest.push(e);
        }
    }

    let resolver_cats: &[DocCategory] = match &input.category {
        Some(c) => std::slice::from_ref(c),
        None => &CLASSIFY_ORDER,
    };
    let mut seen: HashSet<(DocCategory, &str)> =
        exact.iter().chain(&prefix).map(|e| e.key()).collect();
    let resolver_hits: Vec<Entry> = resolver_cats
        .iter()
        .filter_map(|&cat| resolve_in(corpus, cat, query))
        .filter(|h| seen.insert((h.category, h.id)))
        .map(|h| Entry::of(h.category, h.rec))
        .collect();

    // `rest` already excludes exact and prefix; resolver hits are few, so
    // scanning them beats hashing every `rest` entry.
    let mut fuzzy: Vec<(&Entry, u32)> = rest
        .iter()
        .filter(|e| !resolver_hits.iter().any(|r| r.key() == e.key()))
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
        .copied()
        .chain(&resolver_hits)
        .chain(prefix.iter().copied())
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
