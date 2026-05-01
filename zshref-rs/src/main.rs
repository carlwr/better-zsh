//! `zshref` — Rust CLI for the bundled static zsh reference.
//!
//! Loads TS-emitted corpus + tool-def JSON at compile time via `include_bytes!`,
//! builds the `clap` command tree from `tooldef.json`, and dispatches to
//! tool impls under `tools/`. See DEVELOPMENT.md for the src layout.

mod batch;
mod cli;
mod corpus;
mod fuzzy;
mod output;
mod resolver;
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
