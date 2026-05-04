//! Tool-impl dispatch. Modules port the corresponding TS tools.

pub mod docs;
pub mod envelope;
pub mod info;
pub mod list;
pub mod record_fields;
pub mod schema;
pub mod search;

use crate::corpus::{Corpus, ToolDef};
use anyhow::{anyhow, Result};
use serde_json::Value;

/// Dispatch over a JSON `input` object. Both CLI and batch adapters funnel here.
pub fn dispatch(td: &ToolDef, input: &Value, corpus: &Corpus) -> Result<Value> {
    match td.name.as_str() {
        "zsh_docs" => docs::run(input, corpus),
        "zsh_search" => search::run(input, corpus),
        "zsh_list" => list::run(input, corpus),
        other => Err(anyhow!("unknown tool {other}")),
    }
}
