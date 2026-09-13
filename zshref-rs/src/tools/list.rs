//! `zsh_list` — enumerate corpus records (no `mdBody`), optional category filter.
//! `limit=0` → metadata only (`matchesTotal` nonzero, `matches` empty).

use crate::corpus::Corpus;
use crate::tools::envelope::{mk_entry, mk_envelope};
use crate::tools::record_fields::{record_display, record_id, record_sub_kind};
use crate::tools::schema::{category_shape, limit_shape, output_schema, MatchShape};
use crate::tools::{prose, Field, ToolDef};
use anyhow::Result;
use serde_json::Value;

pub fn def(corpus: &Corpus) -> ToolDef {
    ToolDef::new(
        "zsh_list",
        prose::LIST_BRIEF,
        prose::list_long(),
        &[
            Field::optional(
                "category",
                prose::flag_filter_category(corpus.index),
                category_shape(),
            ),
            Field::optional("limit", prose::flag_limit(), limit_shape()),
        ],
        output_schema(&MatchShape::default(), corpus),
        run,
    )
}

pub fn run(input: &Value, corpus: &Corpus) -> Result<Value> {
    let category = input.get("category").and_then(Value::as_str);
    // Callers fill the schema default (clap / `tools::input`).
    let limit = input.get("limit").and_then(Value::as_u64).unwrap_or(0) as usize;

    let pool = entries(corpus, category);
    let total = pool.len();
    let matches: Vec<Value> = pool.into_iter().take(limit).collect();
    Ok(mk_envelope(matches, total))
}

fn entries(corpus: &Corpus, cat_filter: Option<&str>) -> Vec<Value> {
    corpus
        .categories
        .iter()
        .filter(|cat| cat_filter.is_none_or(|f| cat.name == f))
        .flat_map(|cat| {
            cat.records.iter().map(move |rec| {
                mk_entry(
                    cat.name,
                    record_id(cat.name, rec),
                    record_display(cat.name, rec),
                    record_sub_kind(cat.name, rec),
                    None,
                )
            })
        })
        .collect()
}
