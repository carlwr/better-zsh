//! Hand-curated `--help` text for the CLI shell.

// Prose strings in this file are hand-written by a human. Agents making changes to this file must approach with great care.

use crate::corpus::Corpus;
use crate::output;
use crate::tools::{ToolName, ToolSet};
use indoc::{formatdoc, indoc};
use serde_json::{json, Value};

pub const BIN: &str = "zshref";

pub const ROOT_ABOUT: &str = indoc! {"
    Query a bundled static zsh reference.

    github.com/carlwr/zshref
    "};

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

const _: () = assert!(
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

/// Below clap's `Commands:` / `Options:`: the static head, then a workflow
/// example run through the real tools so its JSON is what the user gets.
pub fn root_after_help_tail(tool_set: &ToolSet, corpus: &Corpus) -> String {
    let workflow = workflow_example(tool_set, corpus);
    format!("{ROOT_AFTER_HELP_HEAD}\n\n{workflow}\n")
}

/// `!` resolves in several categories; `--category=conditional_op` narrows
/// it to two records (`!`, `!=`), and `!`'s `mdBody` is short enough to
/// show unelided — so the example shows both the search → docs sequence
/// and why `category` matters.
fn workflow_example(tool_set: &ToolSet, corpus: &Corpus) -> String {
    let search_tool = tool_set.get(ToolName::Search);
    let docs_tool = tool_set.get(ToolName::Docs);

    let search_in = json!({ "query": "!", "category": "conditional_op" });
    let docs_in = json!({ "key": "!", "category": "conditional_op" });

    let search_out = search_tool
        .call(&search_in, corpus)
        .expect("workflow search must run");
    let mut docs_out = docs_tool
        .call(&docs_in, corpus)
        .expect("workflow docs must run");
    // Must stay a no-op (step 2 promises the full body); the help-example
    // test asserts it.
    elide_for_help_example(&mut docs_out);

    let search_rendered = output::render(&search_out, true);
    let docs_rendered = output::render(&docs_out, true);

    formatdoc! {"
        Typical workflow:

            $ # 1. find candidates by name (narrow with --category):
            $ zshref search --query='!' --category=conditional_op --pretty
        {search_block}

            $ # 2. fetch the full markdown for one of the matches:
            $ zshref docs --key='!' --category=conditional_op --pretty
        {docs_block}\
        ",
        search_block = indent_block(&search_rendered),
        docs_block = indent_block(&docs_rendered),
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

pub const PRETTY_HELP: &str = indoc! {"
    emit indented multi-line JSON

    Not recommended for agents. Pretty-printing inflates output size by roughly 30-40% in tokens without adding information.

    Default: compact JSON
    "};

pub fn batch_long(tool_set: &ToolSet, corpus: &Corpus) -> String {
    let example = batch_example(tool_set, corpus);
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

fn batch_example(tool_set: &ToolSet, corpus: &Corpus) -> String {
    let tool = tool_set.get(ToolName::Search);
    let input = json!({ "query": "autolo", "limit": 1 });
    let output = tool
        .call(&input, corpus)
        .expect("batch help example must run");
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

pub fn schema_long(words: usize) -> String {
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

/// Columns a help page is laid out for.
const HELP_COLUMNS: usize = 80;

/// Indent of a help example's command output.
const EXAMPLE_INDENT: &str = "    ";

/// Pretty-printed JSON indent of a `matches[]` element's fields.
const MATCH_FIELD_INDENT: usize = 6;

/// Widest JSON-encoded `mdBody` a help example shows verbatim: JSON strings
/// cannot span lines, so a wider one would make clap wrap inside the
/// string and break the JSON.
pub const MDBODY_ENCODED_MAX: usize =
    HELP_COLUMNS - EXAMPLE_INDENT.len() - MATCH_FIELD_INDENT - r#""mdBody": "#.len() - ",".len();

pub const MDBODY_ELIDE_PLACEHOLDER: &str = "<elided for this help display>";

/// Replace every `mdBody` wider than `MDBODY_ENCODED_MAX` with the
/// placeholder. Help-rendering path only; real CLI output is unaffected.
pub fn elide_for_help_example(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (k, v) in map.iter_mut() {
                if k == "mdBody" {
                    let encoded =
                        serde_json::to_string(v).map_or(usize::MAX, |e| e.chars().count());
                    if encoded > MDBODY_ENCODED_MAX {
                        *v = Value::String(MDBODY_ELIDE_PLACEHOLDER.to_string());
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

/// Render an `Example:` / `Examples:` block.
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

/// One example under a caller-chosen heading (e.g. `Recipe — …:`).
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
    format!("{indented_command}\n{}", indent_block(ex.output))
}

fn indent_block(s: &str) -> String {
    s.trim_end()
        .lines()
        .map(|line| format!("{EXAMPLE_INDENT}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
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

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    /// A `docs` envelope around one `mdBody`, as the examples render it.
    fn docs_envelope(md_body: &str) -> Value {
        json!({
            "matches": [{
                "category": "option", "id": "x", "display": "X", "title": "`X`",
                "mdBody": md_body,
            }],
            "matchesReturned": 1,
            "matchesTotal": 1,
        })
    }

    fn encoded_width(s: &str) -> usize {
        serde_json::to_string(s).expect("string").chars().count()
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(256))]

        // Newlines, quotes, backslashes and control chars inflate under
        // JSON escaping; non-ASCII does not.
        #[test]
        fn elided_examples_fit_and_short_bodies_show_verbatim(
            md_body in prop_oneof![r"[\P{C}\n\t]{0,90}", r"[\x00-\x7f]{0,90}"],
        ) {
            let mut v = docs_envelope(&md_body);
            elide_for_help_example(&mut v);
            let block = indent_block(&output::render(&v, true));
            for line in block.lines() {
                prop_assert!(line.chars().count() <= HELP_COLUMNS, "{line:?}");
            }
            let shown = v["matches"][0]["mdBody"].as_str().expect("string");
            if encoded_width(&md_body) <= MDBODY_ENCODED_MAX {
                prop_assert_eq!(shown, md_body.as_str());
            } else {
                prop_assert_eq!(shown, MDBODY_ELIDE_PLACEHOLDER);
            }
        }
    }
}
