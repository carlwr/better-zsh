//! Hand-curated `--help` text for the CLI shell.

// Prose strings in this file are hand-written by a human. Agents making changes to this file must approach with great care.

use crate::corpus::ToolDef;
use indoc::{formatdoc, indoc};

pub const BIN: &str = "zshref";

pub const ROOT_BRIEF: &str = indoc! {"
    Query a bundled static zsh reference.

    github.com/carlwr/zshref
    "};

pub const ROOT_LONG: &str = ROOT_BRIEF;

// Hand-aligned so tool subcommands line up across columns.
//
//
//                    spending the entirety of the
//                    project strangeness budget on
//                    this pad-aligned Usage: string.
//
//                    Dear agents: DO NOT TOUCH.
//
//                      |         |         |
//                      |         |         |
//                      v         v         v
pub const ROOT_USAGE: &str = {
    "
  zshref docs   --key=K   [--category=C]             [--pretty]
  zshref search --query=W [--category=C] [--limit=L] [--pretty]
  zshref list             [--category=C] [--limit=L] [--pretty]

  zshref batch

  zshref [ info | schema | completions <SHELL> | help [COMMAND] ]"
};

const __CHECK_ROOT_USAGE: () = assert!(
    matches!(
      ROOT_USAGE.as_bytes(),
      [b'\n', b' ', b' ', d, ..] if *d != b' '
    ),
    "should lead with newline and be indented 2 spaces"
);

pub const ROOT_AFTER_HELP_TAIL: &str = indoc! {"
    Output streams:
      stdout   output of tool subcommands and of `completions`
      stderr   help, version, errors, warnings

    Exit codes:
      0        success (also for empty matches)
      1        unexpected internal error
      2        invalid input (bad flag, enum, or subcommand)

    Environment:
      NO_COLOR
      CLICOLOR_FORCE

    Examples:
      zshref docs --key AUTO_CD
      zshref docs --key NO_AUTO_CD
      zshref docs --key typeset
      zshref search --query printf --limit 5
      zshref list --category option --limit 200

      # print first 20 records of every category:
      zshref list
      "
};

pub const BATCH_ABOUT: &str = "read JSONL requests on stdin; emit JSONL responses";

pub const INFO_ABOUT: &str = "emit corpus + upstream metadata as pretty-printed JSON";

// Size hint on `about` warns agents off bulk-piping into context.
pub fn schema_about(words: usize) -> String {
    format!("emit JSON Schema for tool inputs + outputs (≈{words} words)")
}

pub const COMPL_ABOUT: &str = "emit a shell-completion script for the given shell to stdout";

pub const ROOT_PRETTY_HELP: &str = "Emit indented multi-line JSON instead of compact JSON";

pub const BATCH_LONG: &str = indoc! {r#"
    JSONL request/response mode for tests and IPC.

    Input: one request object per non-empty stdin line:
    {
      "tool": "zsh_docs",
      "input": {}
    }

    Success response:
    {
      "ok": true,
      "output": {}
    }

    Error response:
    {
      "ok": false,
      "error": "..."
    }

    Per-request errors are in-band. Exit code is 0 unless stdin I/O fails. The protocol requires one response line per request.

    Request `input` schemas: `zshref schema`.
"#};

pub fn schema_long(words: usize, _leaves: usize) -> String {
    formatdoc! {"
        Emit a JSON Schema bundle for tool inputs and outputs.

        Contains:
          inputSchema per tool
          outputSchema per tool

        Use for:
          codegen
          programmatic validation
          `zshref batch` request shapes

        Size:
          ≈{words} words

        For documentation, prefer `zshref <COMMAND> --help` or `zshref completions <SHELL>`. Bulk-piping this into an agent context window is rarely useful.
    "}
}

pub fn shell_example(command: &str, output: &str) -> String {
    let indented = output
        .trim_end()
        .lines()
        .map(|line| format!("    {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!("\nExample:\n\n    $ {command}\n{indented}")
}

pub const COMPL_SHELL_HELP: &str = indoc! {"
    target shell

    Values:
      bash
      zsh
      fish
      elvish
      powershell
    "};

const CLI_OMIT_TOOLDEF_LINES: &[&str] = &["No shell execution, no environment access."];

/// Tooldef descriptions are MCP-primary. Remove lines that are useful for
/// agents but too README-like for terminal help.
pub fn cli_tool_description(s: &str) -> String {
    s.lines()
        .filter(|line| {
            let trimmed = line.trim();
            !CLI_OMIT_TOOLDEF_LINES
                .iter()
                .any(|omitted| trimmed == *omitted)
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim_end()
        .to_string()
}

/// Rewrite MCP-primary `zsh_*` names to `zshref *` — avoids duplicating
/// descriptions across the CLI and MCP seam.
pub fn rewrite_refs(s: &str, tools: &[ToolDef]) -> String {
    let mut out = s.to_string();
    for td in tools {
        out = out.replace(
            &td.name,
            &format!("zshref {}", super::subcommand_name(&td.name)),
        );
    }
    out
}
