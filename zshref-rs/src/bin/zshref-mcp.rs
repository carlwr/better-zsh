//! `zshref-mcp` — the MCP server binary: the tool set over stdio JSON-RPC.

use anyhow::Result;
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
    JsonObject, ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerInfo, Tool,
};
use rmcp::service::{RequestContext, ServerInitializeError};
use rmcp::{ErrorData, RoleServer, ServerHandler, ServiceExt};
use serde_json::Value;
use std::io::IsTerminal;
use std::sync::Arc;
use zshref::corpus::{Corpus, ToolDefs};
use zshref::{cli, corpus, tools};

const BIN: &str = "zshref-mcp";

const HELP: &str = "\
zshref-mcp — static zsh reference as Model Context Protocol tools

An MCP server: speaks JSON-RPC over stdio and is launched by an MCP client
(Claude Code, Claude Desktop, Cursor, Zed, VS Code, opencode, …), not run in
a terminal.

Flags:
  -h, --help     print help
  -V, --version  print version

Client configuration:
  command: zshref-mcp
  args:    none

Setup per client: github.com/carlwr/zshref
";

const TTY_HINT: &str = "\
zshref-mcp: MCP server; speaks JSON-RPC on stdio.
No flags given and stdin is a terminal — nothing will happen here.
Configure an MCP client to launch this bin, or run `zshref-mcp --help`.
";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = match run(&args) {
        Ok(code) => code,
        Err(err) => {
            eprintln!("{BIN}: {err:#}");
            1
        }
    };
    std::process::exit(code);
}

fn run(args: &[String]) -> Result<i32> {
    match decide(args, std::io::stdin().is_terminal()) {
        Action::Help => print!("{HELP}"),
        Action::Version => println!("{BIN} {}", cli::version_string(&corpus::load_corpus()?)),
        Action::TtyHint => eprint!("{TTY_HINT}"),
        Action::Run => serve()?,
    }
    Ok(0)
}

#[derive(Debug, PartialEq)]
enum Action {
    Help,
    Version,
    TtyHint,
    Run,
}

/// An MCP client launches the bin with no flags and a piped stdin; a human
/// typing its name in a terminal gets a hint instead of a silent process
/// that looks hung. Flags win over the terminal check.
// Considered clap; picked hand-rolled matching because the surface is two
// flags with no option-arguments, and a clap `Command` would bring its own
// help layout to a bin whose help is a short note.
fn decide(args: &[String], stdin_is_terminal: bool) -> Action {
    for arg in args {
        match arg.as_str() {
            "--help" | "-h" => return Action::Help,
            "--version" | "-V" => return Action::Version,
            _ => {}
        }
    }
    if stdin_is_terminal {
        Action::TtyHint
    } else {
        Action::Run
    }
}

#[tokio::main(flavor = "current_thread")]
async fn serve() -> Result<()> {
    let server = Server::new(corpus::load_tool_defs()?, corpus::load_corpus()?);
    let running = match server.serve(rmcp::transport::stdio()).await {
        Ok(running) => running,
        // The client went away before the handshake completed: nothing to do.
        Err(ServerInitializeError::ConnectionClosed(_)) => return Ok(()),
        Err(err) => return Err(err.into()),
    };
    running.waiting().await?;
    Ok(())
}

struct Server {
    tool_defs: ToolDefs,
    corpus: Corpus,
    /// The `tools/list` payload, built once from `tool_defs`.
    tools: Vec<Tool>,
}

impl Server {
    fn new(tool_defs: ToolDefs, corpus: Corpus) -> Self {
        let tools = tool_defs
            .tools
            .iter()
            .map(|td| {
                Tool::new(
                    td.name.clone(),
                    td.description.clone(),
                    schema_object(&td.input_schema),
                )
                .with_raw_output_schema(schema_object(&td.output_schema))
            })
            .collect();
        Self {
            tool_defs,
            corpus,
            tools,
        }
    }
}

fn schema_object(schema: &Value) -> Arc<JsonObject> {
    Arc::new(
        schema
            .as_object()
            .cloned()
            .expect("tooldef schemas are JSON objects"),
    )
}

fn error(message: String) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(message)])
}

impl ServerHandler for Server {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(BIN, env!("CARGO_PKG_VERSION")))
            .with_instructions(self.tool_defs.preamble.clone())
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult::with_all_items(self.tools.clone()))
    }

    // Tool-level failures (unknown tool, invalid input) are `isError` results
    // rather than JSON-RPC errors: they are the caller's to read and retry.
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let result = match self.tool_defs.get(&request.name) {
            None => error(format!("unknown tool: {}", request.name)),
            Some(td) => {
                let input = Value::Object(request.arguments.unwrap_or_default());
                match tools::call(td, &input, &self.corpus) {
                    Ok(output) => CallToolResult::structured(output),
                    Err(err) => error(format!("{err:#}")),
                }
            }
        };
        Ok(result.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn decide_flags_then_terminal_check() {
        let cases: &[(&[&str], bool, Action)] = &[
            (&["--help"], false, Action::Help),
            (&["-h"], false, Action::Help),
            (&["--version"], false, Action::Version),
            (&["-V"], false, Action::Version),
            (&[], true, Action::TtyHint),
            (&[], false, Action::Run),
            // flags win over the terminal check
            (&["--help"], true, Action::Help),
            (&["--version"], true, Action::Version),
            // unknown flags fall through
            (&["--what"], false, Action::Run),
            (&["--what"], true, Action::TtyHint),
            // first flag wins
            (&["--version", "--help"], false, Action::Version),
        ];
        for (list, tty, expected) in cases {
            assert_eq!(decide(&args(list), *tty), *expected, "{list:?} tty={tty}");
        }
    }

    #[test]
    fn help_and_hint_fit_80_columns() {
        for line in HELP.lines().chain(TTY_HINT.lines()) {
            assert!(line.chars().count() <= 80, "{line:?}");
        }
    }
}
