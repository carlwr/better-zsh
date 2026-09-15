//! `zsh_list` — enumerate corpus records (no `mdBody`), optional category filter.
//! `limit=0` → metadata only (`matchesTotal` nonzero, `matches` empty).

use crate::corpus::{Corpus, DocCategory};
use crate::tools::envelope::{mk_entry, mk_envelope};
use crate::tools::schema::{output_schema, MatchShape, Shape};
use crate::tools::{category_input, prose, Field, Tool, ToolName};
use anyhow::Result;
use serde_json::Value;

pub fn tool(corpus: &Corpus) -> Tool {
    Tool::new(
        ToolName::List,
        prose::list(),
        vec![
            Field::optional(
                "category",
                prose::filter_category(corpus.index),
                Shape::Category,
            ),
            Field::optional("limit", prose::limit(), Shape::Limit),
        ],
        output_schema(&MatchShape::default(), corpus),
        run,
    )
}

pub fn run(input: &Value, corpus: &Corpus) -> Result<Value> {
    let category = category_input(input)?;
    let limit = input.get("limit").and_then(Value::as_u64).unwrap_or(0) as usize;

    let pool = entries(corpus, category);
    let total = pool.len();
    let matches: Vec<Value> = pool.into_iter().take(limit).collect();
    Ok(mk_envelope(matches, total))
}

fn entries(corpus: &Corpus, cat_filter: Option<DocCategory>) -> Vec<Value> {
    corpus
        .categories
        .iter()
        .filter(|cat| cat_filter.is_none_or(|f| cat.name == f))
        .flat_map(|cat| {
            cat.records
                .iter()
                .map(move |rec| mk_entry(cat.name, rec.id(), rec.display(), rec.sub_kind(), None))
        })
        .collect()
}
