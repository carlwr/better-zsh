//! `zshref` — the CLI binary.

use anyhow::Result;
use zshref::tools::ToolSet;
use zshref::{cli, lexicon};

fn main() {
    let code = match run() {
        Ok(code) => code,
        Err(err) if cli::is_broken_pipe(&err) => 0,
        Err(err) => {
            eprintln!("zshref: {err:#}");
            1
        }
    };
    std::process::exit(code);
}

fn run() -> Result<i32> {
    let lexicon = lexicon::load_lexicon()?;
    let tool_set = ToolSet::build(&lexicon);
    let cmd = cli::build_cli(&tool_set, &lexicon, cli::BuildMode::Parsing);
    cli::dispatch(cmd, &tool_set, &lexicon)
}
