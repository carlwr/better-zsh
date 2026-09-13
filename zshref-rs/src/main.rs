//! `zshref` — the CLI binary.

use anyhow::Result;
use zshref::tools::ToolDefs;
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
    let corpus = corpus::load_corpus()?;
    let tool_defs = ToolDefs::build(&corpus);
    let cmd = cli::build_cli(&tool_defs, &corpus, cli::BuildMode::Parsing);
    cli::dispatch(cmd, &tool_defs, &corpus)
}
