//! `zshref` — the CLI binary.

use anyhow::Result;
use zshref::{cli, corpus};

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
