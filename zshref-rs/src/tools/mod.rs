//! Tool-impl dispatch. Each module ports the corresponding TS tool from
//! `packages/zsh-core-tooldef/src/tools/<name>.ts`.

pub mod docs;
pub mod info;
pub mod list;
pub mod search;
pub mod shared;

use crate::corpus::{Corpus, ToolDef};
use anyhow::{anyhow, Result};
use clap::ArgMatches;
use serde_json::Value;

pub fn dispatch(td: &ToolDef, matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    match td.name.as_str() {
        "zsh_docs" => docs::run(matches, corpus),
        "zsh_search" => search::run(matches, corpus),
        "zsh_list" => list::run(matches, corpus),
        other => Err(anyhow!("unknown tool {other}")),
    }
}
