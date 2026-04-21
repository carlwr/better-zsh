//! `zshref` — Rust CLI for the bundled static zsh reference.
//!
//! Loads the TS-emitted corpus JSON + tool-def JSON at compile time via
//! `include_bytes!`, deserialises them, builds the `clap` command tree
//! from `tool-def.json`, and dispatches to the four tool impls under
//! `tools/`. See the repo plan for architecture.

mod cli;
mod corpus;
mod fuzzy;
mod output;
mod tools;

use anyhow::Result;

fn main() {
    let code = match run() {
        Ok(code) => code,
        Err(err) => {
            eprintln!("zshref: {err:#}");
            1
        }
    };
    std::process::exit(code);
}

fn run() -> Result<i32> {
    let tool_defs = corpus::load_tool_defs()?;
    let corpus = corpus::load_corpus()?;
    let cmd = cli::build_cli(&tool_defs, &corpus);
    cli::dispatch(cmd, &tool_defs, &corpus)
}
