//! Rust CLI entry point for the bundled zsh reference.

mod batch;
mod cli;
mod corpus;
// NLP-only: fingerprinting pulls in `sha2` and is only used by internal checks.
#[cfg(feature = "nlp")]
mod data_fingerprint;
mod fuzzy;
#[cfg(feature = "nlp")]
mod nlp;
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
    let cmd = cli::build_cli(&tool_defs, &corpus, cli::BuildMode::Parsing);
    cli::dispatch(cmd, &tool_defs, &corpus)
}
