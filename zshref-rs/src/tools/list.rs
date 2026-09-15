//! `zsh_list` — enumerate corpus records (no `mdBody`), optional category filter.
//! `limit=0` → metadata only (`matchesTotal` nonzero, `matches` empty).

use crate::corpus::{Corpus, DocCategory};
use crate::tools::envelope::{Entry, Envelope, entries};
use crate::tools::schema::{MatchShape, Shape, default_limit, output_schema};
use crate::tools::{Field, Tool, ToolName, prose};
use anyhow::Result;
use serde::Deserialize;
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    category: Option<DocCategory>,
    #[serde(default = "default_limit")]
    limit: u32,
}

fn run(input: Input, corpus: &Corpus) -> Result<Value> {
    let pool = entries(corpus, input.category);
    let total = pool.len();
    let matches: Vec<Entry> = pool.into_iter().take(input.limit as usize).collect();
    Envelope::new(matches, total).to_value()
}
