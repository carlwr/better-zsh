//! Tool-impl dispatch. Each module ports the corresponding TS tool from
//! `packages/zsh-core-tooldef/src/tools/<name>.ts`.

pub mod classify;
pub mod describe;
pub mod info;
pub mod lookup_option;
pub mod search;

use crate::corpus::{Corpus, ToolDef};
use anyhow::{anyhow, Result};
use clap::ArgMatches;
use serde_json::Value;

pub fn dispatch(td: &ToolDef, matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    match td.name.as_str() {
        "zsh_classify" => classify::run(matches, corpus),
        "zsh_search" => search::run(matches, corpus),
        "zsh_describe" => describe::run(matches, corpus),
        "zsh_lookup_option" => lookup_option::run(matches, corpus),
        other => Err(anyhow!("unknown tool {other}")),
    }
}
