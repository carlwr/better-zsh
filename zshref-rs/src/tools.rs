//! Tool-impl dispatch. Modules port the corresponding TS tools.

pub mod docs;
pub mod envelope;
pub mod info;
mod input;
pub mod list;
pub mod record_fields;
pub mod schema;
pub mod search;

use crate::corpus::{Corpus, ToolDef};
use anyhow::{anyhow, Result};
use serde_json::Value;

/// The request path for adapters that hand over raw JSON input (batch, MCP):
/// validate against `inputSchema`, fill its defaults, dispatch. The CLI
/// arrives at `dispatch` directly — clap has already done both.
pub fn call(td: &ToolDef, raw_input: &Value, corpus: &Corpus) -> Result<Value> {
    input::validate(td, raw_input).map_err(anyhow::Error::msg)?;
    dispatch(td, &input::fill_defaults(td, raw_input), corpus)
}

/// Dispatch over a JSON `input` object that already satisfies `inputSchema`.
pub fn dispatch(td: &ToolDef, input: &Value, corpus: &Corpus) -> Result<Value> {
    match td.name.as_str() {
        "zsh_docs" => docs::run(input, corpus),
        "zsh_search" => search::run(input, corpus),
        "zsh_list" => list::run(input, corpus),
        other => Err(anyhow!("unknown tool {other}")),
    }
}
