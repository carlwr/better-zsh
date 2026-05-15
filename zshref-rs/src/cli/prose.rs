//! Hand-curated `--help` text for the CLI shell.

// Prose strings in this file are hand-written by a human. Agents making changes to this file must approach with great care.

use crate::corpus::{Corpus, ToolDef, ToolDefs};
use crate::output;
use crate::tools;
use indoc::{formatdoc, indoc};
use serde_json::{json, Value};

pub const BIN: &str = "zshref";

pub const ROOT_BRIEF: &str = indoc! {"
    Query a bundled static zsh reference.

    github.com/carlwr/zshref
    "};

pub const ROOT_LONG: &str = ROOT_BRIEF;

// Hand-aligned so tool subcommands line up across columns.
//
// Single-letter placeholders for option-args are deliberate; this makes the table-like Usage: possible. Placeholders in _subcommand_ help are full-word; this inconsistency is accepted.
//
//
//                    spending the entirety of the
//                    project strangeness budget on
//                    this pad-aligned guy.
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

const ROOT_AFTER_HELP_HEAD: &str = indoc! {
    "
    Output streams:
      stdout   tool output, completions, explicit help/version
      stderr   errors, warnings, implicit usage on bad input

    Exit codes:
      0        success (also for empty matches)
      1        unexpected internal error
      2        invalid input (bad flag, enum, or subcommand)

    Environment:
      NO_COLOR
      CLICOLOR_FORCE

    Command examples:
      zshref docs --key AUTO_CD
      zshref docs --key NO_AUTO_CD
      zshref docs --key typeset
      zshref search --query printf --limit 5
      zshref list --category job_spec --limit 10"
};

/// Tail of the root `--help` (everything below the auto-generated
/// `Commands:` / `Options:` sections). Static-text head + a dynamically
/// rendered workflow example. The workflow shows the search → docs
/// sequence on a real record so the JSON output is byte-for-byte what
/// the user gets if they run the commands.
pub fn root_after_help_tail(tool_defs: &ToolDefs, corpus: &Corpus) -> String {
    let workflow = workflow_example(tool_defs, corpus);
    format!("{ROOT_AFTER_HELP_HEAD}\n\n{workflow}\n")
}

/// `!` is one of the most overloaded tokens in zsh (5 categories). Narrowing
/// with `--category=conditional_op` keeps the result set to exactly two
/// records (`!`, `!=`); fetching `!` then gives a short, self-explanatory
/// `mdBody` ("true if exp is false."). This makes the example demonstrate
/// (a) the search → docs sequence and (b) why `--category` matters.
fn workflow_example(tool_defs: &ToolDefs, corpus: &Corpus) -> String {
    let find = |name: &str| {
        tool_defs
            .tools
            .iter()
            .find(|t| t.name == name)
            .unwrap_or_else(|| panic!("workflow example needs {name} tooldef"))
    };
    let search_td = find("zsh_search");
    let docs_td = find("zsh_docs");

    // Match `--limit` default-filling that the CLI gets from clap and the
    // batch protocol gets from `fill_defaults_from_schema`. Without this,
    // `dispatch` would see no `limit` and return zero matches.
    let search_in = crate::batch::fill_defaults_from_schema(
        search_td,
        &json!({ "query": "!", "category": "conditional_op" }),
    );
    let docs_in = json!({ "key": "!", "category": "conditional_op" });

    let search_out =
        tools::dispatch(search_td, &search_in, corpus).expect("workflow search must run");
    let mut docs_out = tools::dispatch(docs_td, &docs_in, corpus).expect("workflow docs must run");
    // Defensive: the chosen record's `mdBody` is under threshold so no
    // elision should fire, but a future corpus change could push it over.
    elide_for_help_example(&mut docs_out);

    let search_rendered = output::render(&search_out, true);
    let docs_rendered = output::render(&docs_out, true);
    let indent = |s: &str| {
        s.trim_end()
            .lines()
            .map(|l| format!("    {l}"))
            .collect::<Vec<_>>()
            .join("\n")
    };

    formatdoc! {"
        Typical workflow:

            $ # 1. find candidates by name (narrow with --category):
            $ zshref search --query='!' --category=conditional_op --pretty
        {search_block}

            $ # 2. fetch the full markdown for one of the matches:
            $ zshref docs --key='!' --category=conditional_op --pretty
        {docs_block}\
        ",
        search_block = indent(&search_rendered),
        docs_block = indent(&docs_rendered),
    }
}

pub const BATCH_ABOUT: &str = "read JSONL requests on stdin; emit JSONL responses";

pub const INFO_ABOUT: &str = "emit corpus + upstream metadata as pretty-printed JSON";

// Size hint on `about` warns agents off bulk-piping into context.
pub fn schema_about(words: usize) -> String {
    format!("emit JSON Schema for tool inputs + outputs (≈{words} words)")
}

pub const COMPL_ABOUT: &str = "emit a shell-completion script for the given shell to stdout";

pub const HELP_ABOUT: &str = "print this message or help for a subcommand";

pub const HELP_COMMAND_HELP: &str = "subcommand to show help for";

pub const HELP_FLAG_HELP: &str = "print help";

pub const VERSION_FLAG_HELP: &str = "print version";

pub const ROOT_PRETTY_HELP: &str = indoc! {"
    emit indented multi-line JSON

    Not recommended for agents. Pretty-printing inflates output size by roughly 30-40% in tokens without adding information.

    Default: compact JSON
    "};

pub fn batch_long(tool_defs: &ToolDefs, corpus: &Corpus) -> String {
    let example = batch_example(tool_defs, corpus);
    formatdoc! {r#"
        JSONL request/response mode for tests and IPC.

        Tool names follow the pattern `zsh_<verb>` and correspond to the CLI subcommand `<verb>` (e.g. `zsh_docs` ↔ `zshref docs`).

        {example}

        Error response shape:
        {{
          "ok": false,
          "error": "..."
        }}

        Per-request errors are in-band. Exit code is 0 unless stdin I/O fails. The protocol requires one response line per request.

        The request format is documented through a schema; see `zshref schema --help`.
    "#}
}

fn batch_example(tool_defs: &ToolDefs, corpus: &Corpus) -> String {
    let td = tool_defs
        .tools
        .iter()
        .find(|t| t.name == "zsh_search")
        .expect("batch help example needs zsh_search tooldef");
    let input = json!({ "query": "autolo", "limit": 1 });
    let output = tools::dispatch(td, &input, corpus).expect("batch help example must run");
    let envelope = json!({ "ok": true, "output": output });
    // Real output is compact JSONL — too long to fit indented at 80 cols.
    // Pretty-print (and `| jq`) so body lines are short; the explicit
    // continuation keeps the prompt line itself <80
    // (CLI-POLICY.md wrapping-may-not-lose-indent).
    let pretty = serde_json::to_string_pretty(&envelope).expect("envelope serializes");
    shell_examples(&[ShellExample {
        prompt: r#"echo '{"tool":"zsh_search","input":{"query":"autolo","limit":1}}'"#,
        continuations: &["| zshref batch | jq"],
        output: &pretty,
    }])
}

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

/// One shell example: command line(s) + captured output.
///
/// `prompt` is the first command line (no `$`, no trailing `\`);
/// `continuations` are subsequent command lines (same rules).
/// `shell_examples` adds the `$ ` prefix, command/output indent, and
/// `\` glue between command lines — callers don't shape whitespace.
pub struct ShellExample<'a> {
    pub prompt: &'a str,
    pub continuations: &'a [&'a str],
    pub output: &'a str,
}

/// Raw-char threshold above which a `mdBody` string in a help example is
/// replaced with `MDBODY_ELIDE_PLACEHOLDER`. JSON strings cannot legally
/// span physical lines, so an oversize `mdBody` would force clap to wrap
/// inside the string and break the JSON syntax. Tuned for the example
/// block's 10-char indent + `"mdBody": "` overhead + `\n`-as-`\\n` JSON
/// escape inflation.
pub const MDBODY_ELIDE_THRESHOLD: usize = 45;

pub const MDBODY_ELIDE_PLACEHOLDER: &str = "<elided for this help display>";

/// Walk a JSON `Value` and replace any `mdBody` string field whose raw
/// length is at or above `MDBODY_ELIDE_THRESHOLD` with the placeholder.
/// The render of `output::render` then produces an example that fits in
/// 80 cols without clap reflow inside JSON strings. Lives in the help-
/// rendering path so the real CLI output is unaffected.
pub fn elide_for_help_example(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (k, v) in map.iter_mut() {
                if k == "mdBody" {
                    if let Value::String(s) = v {
                        if s.len() >= MDBODY_ELIDE_THRESHOLD {
                            *v = Value::String(MDBODY_ELIDE_PLACEHOLDER.to_string());
                        }
                    }
                } else {
                    elide_for_help_example(v);
                }
            }
        }
        Value::Array(arr) => arr.iter_mut().for_each(elide_for_help_example),
        _ => {}
    }
}

/// Render an `Example:` / `Examples:` block. Heading is singular for one
/// example, plural for more.
pub fn shell_examples(items: &[ShellExample<'_>]) -> String {
    let heading = if items.len() == 1 {
        "Example:"
    } else {
        "Examples:"
    };
    let bodies: Vec<String> = items.iter().map(render_one).collect();
    // `tool_after_help` joins description and example with `\n\n`; no leading
    // newline here, otherwise the rendered help shows a triple-blank gap.
    format!("{heading}\n\n{}", bodies.join("\n\n"))
}

/// Single example block under a caller-chosen heading. Same body layout as
/// `shell_examples` but lets the caller label the block for distinct
/// purpose (e.g. `Recipe — …:` next to the regular `Examples:` block).
pub fn labelled_example(heading: &str, ex: ShellExample<'_>) -> String {
    format!("{heading}\n\n{}", render_one(&ex))
}

fn render_one(ex: &ShellExample<'_>) -> String {
    let total = 1 + ex.continuations.len();
    let indented_command = std::iter::once(ex.prompt)
        .chain(ex.continuations.iter().copied())
        .enumerate()
        .map(|(i, body)| {
            let indent = if i == 0 { "    $ " } else { "        " };
            let glue = if i + 1 < total { " \\" } else { "" };
            format!("{indent}{body}{glue}")
        })
        .collect::<Vec<_>>()
        .join("\n");
    let indented_output = ex
        .output
        .trim_end()
        .lines()
        .map(|line| format!("    {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{indented_command}\n{indented_output}")
}

/// Upstream-zsh line for the `--version` block. `commit_short` is omitted
/// in dev builds where the corpus carries no commit hash.
pub fn version_upstream_line(tag: &str, date: &str, commit_short: Option<&str>) -> String {
    match commit_short {
        Some(c) => format!("zsh upstream: {tag} ({c}, {date})"),
        None => format!("zsh upstream: {tag} ({date})"),
    }
}

/// Corpus-totals line for the `--version` block.
pub fn version_corpus_summary(total: usize, cats: usize) -> String {
    format!("{total} records across {cats} categories")
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
            !CLI_OMIT_TOOLDEF_LINES.contains(&trimmed)
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
