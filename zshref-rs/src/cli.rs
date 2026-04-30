//! Dynamic clap::Command assembly driven by `tooldef.json`.
//!
//! Subcommand names are the tool names with the leading `zsh_` stripped
//! (matches the TS adapters). Value parsers are inferred from each
//! property's JSON Schema fragment: enum (`category`) → PossibleValues,
//! integer with bounds → u32 range, everything else → String.

use crate::corpus::{Corpus, ToolDef, ToolDefs, DOC_CATEGORIES};
use crate::output;
use crate::tools;
use anyhow::Result;
use clap::{Arg, ArgAction, ArgMatches, Command};
use serde_json::{Map, Value};

const ROOT_BIN_NAME: &str = "zshref";

const ROOT_BRIEF: &str = "Query a bundled static zsh reference from the command line.";

const ROOT_AFTER_HELP_TAIL: &str = concat!(
    "Exit codes:\n",
    "  0  success (also for empty matches)\n",
    "  1  unexpected internal error\n",
    "  2  invalid input (bad flag, enum, or subcommand)\n",
    "\n",
    "Environment:\n",
    "  NO_COLOR          present + non-empty disables ANSI colors\n",
    "  CLICOLOR_FORCE    present + non-empty forces ANSI colors on (even off a TTY)\n",
    "\n",
    "Examples:\n",
    "  zshref docs --raw AUTO_CD\n",
    "  zshref docs --raw NO_AUTO_CD                  # surfaces feedback:input-negated\n",
    "  zshref docs --raw for                         # multi-match without --category\n",
    "  zshref search --query printf --limit 5\n",
    "  zshref list --category option --limit 200\n",
    "  zshref list                                   # first 20 records of every category\n",
);

// Hand-aligned so tool subcommands line up across columns.
// Clap's default single-line usage loses readability for this surface.
const ROOT_USAGE: &str = concat!(
    "zshref [--pretty] docs    --raw=R   [--category=C]\n",
    "  zshref [--pretty] search  --query=W [--category=C] [--limit=L]\n",
    "  zshref [--pretty] list              [--category=C] [--limit=L]\n",
    "\n",
    "  zshref [--pretty] info\n",
    "  zshref [--pretty] schema\n",
    "  zshref batch                                 # JSONL on stdin/stdout\n",
    "  zshref completions <SHELL>\n",
    "  zshref help [COMMAND]",
);

pub fn subcommand_name(tool_name: &str) -> &str {
    tool_name.strip_prefix("zsh_").unwrap_or(tool_name)
}

pub fn build_cli(tool_defs: &ToolDefs, corpus: &Corpus) -> Command {
    // Preamble uses MCP-primary `zsh_*` names; `cli_prose()` rewrites them
    // to `zshref *`. WARNING in `packages/zsh-core-tooldef/src/tool-defs.ts`
    // applies here too — tone/length drift on that source affects terminal help.
    let root_after_help = format!(
        "{}\n{}",
        cli_prose(&tool_defs.preamble, &tool_defs.tools),
        ROOT_AFTER_HELP_TAIL,
    );

    let mut root = Command::new(ROOT_BIN_NAME)
        .version(version_string(corpus))
        .about(ROOT_BRIEF)
        .long_about(concat!(
            "Query a bundled static zsh reference from the command line.\n\n",
            "Tool subcommands (docs, search, list) emit one compact JSON line ",
            "on stdout (pass `--pretty` for indented multi-line). `info` ",
            "always emits indented multi-line JSON. ",
            "`docs` returns rendered markdown bodies; `search` and `list` return ",
            "identifiers only — pair `search`/`list` results with `docs` for the ",
            "full body. `completions` emits the requested shell script on stdout ",
            "instead. Help, version, errors, and warnings go to stderr. ",
            "ANSI colors in help output are auto-disabled when stderr is not a TTY.",
        ))
        .override_usage(ROOT_USAGE)
        .after_help(root_after_help)
        .arg_required_else_help(true)
        .subcommand_required(true)
        .color(clap::ColorChoice::Auto)
        .arg(
            // Global: both `zshref --pretty docs …` and `zshref docs … --pretty` work.
            // `batch` ignores this — protocol requires one response line per request.
            Arg::new("pretty")
                .long("pretty")
                .action(ArgAction::SetTrue)
                .global(true)
                .help("emit indented multi-line JSON instead of one compact line"),
        );

    for td in &tool_defs.tools {
        root = root.subcommand(build_subcommand(td, &tool_defs.tools));
    }

    root = root.subcommand(
        Command::new("completions")
            .about("emit a shell-completion script for the given shell to stdout")
            .arg(
                Arg::new("shell")
                    .value_name("SHELL")
                    .required(true)
                    .value_parser(clap::value_parser!(clap_complete::Shell))
                    .help("target shell (bash, zsh, fish, elvish, powershell)"),
            ),
    );

    root = root.subcommand(
        Command::new("info").about("emit corpus + upstream metadata as pretty-printed JSON"),
    );

    // Size hint on `about` warns agents off bulk-piping into context.
    let (words, leaves) = tools::schema::size_hint(tool_defs);
    let schema_about =
        format!("emit JSON Schema for tool inputs + outputs (≈{words} words; see --help)");
    let schema_long_about = format!(
        "Emit a JSON bundle of every tool's `inputSchema` and `outputSchema` \
         to stdout. The input schemas also define the request shape for \
         `zshref batch`.\n\
         \n\
         Intended use: codegen and programmatic validation. Not intended \
         for human or agent reading — for documentation, prefer the \
         tool-specific `--help` output and the shell-completion scripts \
         (`zshref completions <SHELL>`).\n\
         \n\
         Size: ≈{words} words / ≈{leaves} leaf JSON properties. Bulk-piping \
         this into an agent's context window is rarely what you want."
    );
    root = root.subcommand(
        Command::new("schema")
            .about(schema_about)
            .long_about(schema_long_about),
    );

    root = root.subcommand(
        Command::new("batch")
            .about("read JSONL requests on stdin; emit JSONL responses (one line per request)")
            .long_about(
                "Streaming I/O mode primarily for cross-language tests and IPC.\n\
                 \n\
                 Reads stdin until EOF; each non-empty line is a JSON object\n\
                 `{\"tool\": \"<name>\", \"input\": {...}}` and produces one\n\
                 compact-JSON response line — `{\"ok\": true, \"output\": ...}`\n\
                 on success or `{\"ok\": false, \"error\": \"...\"}` on a\n\
                 per-request error. Responses preserve input order. Exit code\n\
                 is 0 unless stdin I/O fails (per-request errors are in-band).\n\
                 \n\
                 The `input` shape per tool is the corresponding `inputSchema`\n\
                 emitted by `zshref schema`. `--pretty` is ignored — the\n\
                 protocol requires one response line per request.",
            ),
    );

    root
}

/// Multi-line `--version` string: pkg version, zsh upstream, corpus totals.
/// `commit` may be empty in dev builds — fall back to omitting the parenthetical.
fn version_string(corpus: &Corpus) -> String {
    let pkg_version = env!("CARGO_PKG_VERSION");
    let up = &corpus.index.zsh_upstream;
    let total: usize = corpus.categories.iter().map(|c| c.records.len()).sum();
    let cats = corpus.categories.len();

    let upstream_line = if up.commit.is_empty() {
        format!("zsh upstream: {} ({})", up.tag, up.date)
    } else {
        let commit_short: String = up.commit.chars().take(8).collect();
        format!("zsh upstream: {} ({}, {})", up.tag, commit_short, up.date)
    };
    format!("{pkg_version}\n{upstream_line}\n{total} records across {cats} categories")
}

fn build_subcommand(td: &ToolDef, tools: &[ToolDef]) -> Command {
    let name = subcommand_name(&td.name).to_string();
    let mut cmd = Command::new(name)
        .about(cli_prose(&td.brief, tools))
        .long_about(cli_prose(&td.description, tools))
        .disable_help_flag(false);

    let props = td
        .input_schema
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let required: Vec<String> = td
        .input_schema
        .get("required")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default();

    for (key, spec) in &props {
        let flag_brief = td.flag_briefs.get(key).cloned().unwrap_or_default();
        // MCP and `--help` share `inputSchema.properties[key].description`;
        // `cli_prose` rewrites `zsh_*` refs before render.
        let long_help = spec
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let arg = build_arg(
            key,
            spec,
            required.contains(key),
            &flag_brief,
            &long_help,
            tools,
        );
        cmd = cmd.arg(arg);
    }
    cmd
}

fn build_arg(
    key: &str,
    spec: &Value,
    required: bool,
    help: &str,
    long_help: &str,
    tools: &[ToolDef],
) -> Arg {
    let value_name = key.to_uppercase();
    let mut arg = Arg::new(key.to_string())
        .long(key.to_string())
        .value_name(value_name)
        .help(help.to_string())
        .long_help(cli_prose(long_help, tools))
        .required(required)
        .action(ArgAction::Set)
        // zsh tokens include `-`, `-p`, fd prefixes (`2>`), etc.
        // Without this, `--raw -p` errors; `--raw=VALUE` is the only escape.
        .allow_hyphen_values(true);

    let ty = spec.get("type").and_then(Value::as_str).unwrap_or("string");
    match ty {
        "integer" => {
            let min = spec.get("minimum").and_then(Value::as_i64).unwrap_or(1);
            let max = spec
                .get("maximum")
                .and_then(Value::as_i64)
                .unwrap_or(i64::from(u32::MAX));
            // clap range is i64; u32 parser narrows on parse.
            arg = arg.value_parser(clap::value_parser!(u32).range(min..=max));
            // Schema `default` → clap default; avoids Rust-side mirror constants.
            if let Some(d) = spec.get("default").and_then(Value::as_u64) {
                arg = arg.default_value(Box::leak(d.to_string().into_boxed_str()) as &'static str);
            }
        }
        "string"
            // The `category` flag has a closed enum — expose as PossibleValues
            // so clap generates a clean error + completion for bad inputs.
            // We detect this by name rather than from the schema (the schema
            // stays generic; the category list is owned by zsh-core).
            if key == "category" =>
        {
            arg = arg
                .value_parser(clap::builder::PossibleValuesParser::new(
                    DOC_CATEGORIES.as_slice(),
                ))
                // Description already lists categories; inline block is redundant
                // and wraps badly at narrow widths.
                .hide_possible_values(true);
        }
        _ => {}
    }
    arg
}

/// Rewrite MCP-primary `zsh_*` names to `zshref *` — avoids duplicating
/// descriptions across the CLI and MCP seam.
fn cli_prose(s: &str, tools: &[ToolDef]) -> String {
    let mut out = s.to_string();
    for td in tools {
        out = out.replace(&td.name, &format!("zshref {}", subcommand_name(&td.name)));
    }
    out
}

pub fn dispatch(cmd: Command, tool_defs: &ToolDefs, corpus: &Corpus) -> Result<i32> {
    let mut cmd_for_err = cmd.clone();
    let matches = match cmd.try_get_matches() {
        Ok(m) => m,
        Err(err) => return Ok(output::handle_clap_error(err, &mut cmd_for_err)),
    };

    let (sub_name, sub_matches) = match matches.subcommand() {
        Some(x) => x,
        None => {
            cmd_for_err.print_long_help().ok();
            return Ok(0);
        }
    };

    // Read from sub_matches: global flag propagates here regardless of position.
    let pretty = sub_matches.get_flag("pretty");

    if sub_name == "completions" {
        let shell: clap_complete::Shell = *sub_matches
            .get_one::<clap_complete::Shell>("shell")
            .expect("clap enforces required");
        let mut stdout = std::io::stdout();
        clap_complete::generate(shell, &mut cmd_for_err, ROOT_BIN_NAME, &mut stdout);
        return Ok(0);
    }

    if sub_name == "info" {
        let result = tools::info::run(corpus)?;
        output::emit_pretty(&result);
        return Ok(0);
    }

    if sub_name == "schema" {
        let result = tools::schema::run(tool_defs)?;
        output::emit(&result, pretty);
        return Ok(0);
    }

    if sub_name == "batch" {
        return crate::batch::run(tool_defs, corpus);
    }

    let tool_name = format!("zsh_{sub_name}");
    let td = tool_defs
        .tools
        .iter()
        .find(|t| t.name == tool_name)
        .expect("subcommand registered from tool_defs");

    let input = matches_to_input_value(td, sub_matches);
    let result = tools::dispatch(td, &input, corpus)?;
    output::emit(&result, pretty);
    Ok(0)
}

/// Convert `ArgMatches` → JSON object matching the tool's `inputSchema`.
/// Single boundary between clap-typed values and `&Value` dispatch;
/// `batch::run` builds the same shape from JSONL.
fn matches_to_input_value(td: &ToolDef, matches: &ArgMatches) -> Value {
    let mut obj = Map::new();
    let Some(props) = td.input_schema.get("properties").and_then(Value::as_object) else {
        return Value::Object(obj);
    };
    for (key, spec) in props {
        let ty = spec.get("type").and_then(Value::as_str).unwrap_or("string");
        match ty {
            "integer" => {
                if let Some(v) = matches.get_one::<u32>(key) {
                    obj.insert(key.clone(), Value::Number((*v).into()));
                }
            }
            _ => {
                if let Some(v) = matches.get_one::<String>(key) {
                    obj.insert(key.clone(), Value::String(v.clone()));
                }
            }
        }
    }
    Value::Object(obj)
}
