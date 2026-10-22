//! `zsh_list` — enumerate lexicon records (no `mdBody`), optional category filter.
//! `limit=0` → metadata only (`matchesTotal` nonzero, `matches` empty).

use crate::lexicon::{DocCategory, Lexicon};
use crate::tools::envelope::{Entry, Envelope, entries};
use crate::tools::schema::{MatchShape, Shape, default_limit, limit, non_null, output_schema};
use crate::tools::{Field, Tool, ToolName, prose};
use anyhow::Result;
use serde::Deserialize;
use serde_json::Value;

pub fn tool(lexicon: &Lexicon) -> Tool {
    Tool::new(
        ToolName::List,
        prose::list(),
        vec![
            Field::optional(
                "category",
                prose::filter_category(lexicon.index),
                Shape::Category,
            ),
            Field::optional("limit", prose::limit(), Shape::Limit),
        ],
        output_schema(&MatchShape::default(), lexicon),
        run,
    )
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    #[serde(default, deserialize_with = "non_null")]
    category: Option<DocCategory>,
    #[serde(default = "default_limit", deserialize_with = "limit")]
    limit: u32,
}

fn run(input: Input, lexicon: &Lexicon) -> Result<Value> {
    let pool = entries(lexicon, input.category);
    let total = pool.len();
    let matches: Vec<Entry> = pool.into_iter().take(input.limit as usize).collect();
    Envelope::new(matches, total).to_value()
}
