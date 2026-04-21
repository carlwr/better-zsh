//! Dynamic clap::Command assembly driven by `tooldef.json`.
//!
//! Subcommand names are the tool names with the leading `zsh_` stripped
//! (matches the TS adapters). Value parsers are inferred from each
//! property's JSON Schema fragment: enum (`category`) → PossibleValues,
//! integer with bounds → u32 range, everything else → String.

use crate::corpus::{Corpus, ToolDef, ToolDefs};
use crate::output;
use crate::tools;
use anyhow::Result;
use clap::builder::styling::{AnsiColor, Effects, Styles};
use clap::{Arg, ArgAction, Command};
use serde_json::Value;

const ROOT_BIN_NAME: &str = "zshref";

const ROOT_BRIEF: &str = "Query the bundled static zsh reference from the command line.";

const ROOT_AFTER_HELP: &str = concat!(
    "Exit codes:\n",
    "  0  success (also for {match:null} / empty matches)\n",
    "  1  unexpected internal error\n",
    "  2  invalid input (bad flag, enum, or subcommand)\n",
    "\n",
    "Environment:\n",
    "  NO_COLOR          present + non-empty disables ANSI colors\n",
    "  NOCOLOR           accepted as alias for NO_COLOR\n",
    "\n",
    "Examples:\n",
    "  zshref classify --raw AUTO_CD\n",
    "  zshref search --query printf --limit 5\n",
    "  zshref describe --category builtin --id echo\n",
    "  zshref lookup_option --raw NO_AUTO_CD\n",
);

pub fn subcommand_name(tool_name: &str) -> &str {
    tool_name.strip_prefix("zsh_").unwrap_or(tool_name)
}

/// Explicit `--help` styling.
///
/// Matches `clap::builder::Styles::styled()`'s defaults for `header`,
/// `usage`, `literal`, `error`, `valid`, and `invalid`, but pins them here
/// so styling doesn't silently drift with clap upgrades. `placeholder`
/// (`<RAW>`, `<QUERY>`, ...) is left unstyled; clap's default is also
/// unstyled but that's under-documented — making it explicit removes
/// ambiguity for future readers.
///
/// Styles only render when stderr is a TTY and `NO_COLOR`/`NOCOLOR` are
/// unset (per `CLI-VISUAL-POLICY.md` + clap's auto-color detection);
/// `output::handle_clap_error` respects the same gate for help / version.
fn help_styles() -> Styles {
    Styles::styled()
        .header(AnsiColor::Yellow.on_default() | Effects::BOLD | Effects::UNDERLINE)
        .usage(AnsiColor::Yellow.on_default() | Effects::BOLD)
        .literal(AnsiColor::Green.on_default() | Effects::BOLD)
        .placeholder(AnsiColor::White.on_default())
        .error(AnsiColor::Red.on_default() | Effects::BOLD)
        .valid(AnsiColor::Green.on_default())
        .invalid(AnsiColor::Yellow.on_default())
}

pub fn build_cli(tool_defs: &ToolDefs, corpus: &Corpus) -> Command {
    let mut root = Command::new(ROOT_BIN_NAME)
        .version(version_string(corpus))
        .about(ROOT_BRIEF)
        .long_about(concat!(
            "Query the bundled static zsh reference from the command line.\n\n",
            "On a successful tool invocation, stdout is valid JSON (pretty-",
            "printed, newline-terminated) — pipe to `jq`. All other output ",
            "(help, version, errors) goes to stderr. ANSI colors are auto-",
            "disabled when stderr is not a TTY.",
        ))
        .after_help(ROOT_AFTER_HELP)
        .arg_required_else_help(true)
        .subcommand_required(true)
        .color(clap::ColorChoice::Auto)
        .styles(help_styles());

    for td in &tool_defs.tools {
        root = root.subcommand(build_subcommand(td));
    }

    // `zshref completions <SHELL>` — emit completion script to stdout.
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

    // `zshref info` — emit build-/corpus-level introspection as JSON.
    root = root.subcommand(
        Command::new("info").about("emit corpus + upstream metadata as JSON (no flags)"),
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

fn build_subcommand(td: &ToolDef) -> Command {
    let name = subcommand_name(&td.name).to_string();
    let mut cmd = Command::new(name)
        .about(cli_prose(&td.brief))
        .long_about(cli_prose(&td.description))
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
        let arg = build_arg(key, spec, required.contains(key), &flag_brief);
        cmd = cmd.arg(arg);
    }
    cmd
}

fn build_arg(key: &str, spec: &Value, required: bool, help: &str) -> Arg {
    let value_name = key.to_uppercase();
    let mut arg = Arg::new(key.to_string())
        .long(key.to_string())
        .value_name(value_name)
        .help(help.to_string())
        .required(required)
        .action(ArgAction::Set)
        // Accept leading-dash values: real zsh tokens include `-`, `-p`,
        // numeric fd prefixes (`2>`), etc. Without this, `--raw -p` errors
        // with "unexpected argument '-p'". The `--raw=VALUE` form was the
        // only other escape, which is surprising for users.
        .allow_hyphen_values(true);

    let ty = spec.get("type").and_then(Value::as_str).unwrap_or("string");
    match ty {
        "integer" => {
            let min = spec.get("minimum").and_then(Value::as_i64).unwrap_or(1);
            let max = spec
                .get("maximum")
                .and_then(Value::as_i64)
                .unwrap_or(i64::from(u32::MAX));
            // clap's range bound is i64; u32 value-parser narrows on parse.
            arg = arg.value_parser(clap::value_parser!(u32).range(min..=max));
        }
        "string"
            // The `category` flag has a closed enum — expose as PossibleValues
            // so clap generates a clean error + completion for bad inputs.
            // We detect this by name rather than from the schema (the schema
            // stays generic; the category list is owned by zsh-core).
            if key == "category" =>
        {
            arg = arg
                .value_parser(clap::builder::PossibleValuesParser::new(DOC_CATEGORIES))
                // The tool description already enumerates the 16 category
                // values one-per-line; clap's default inline `[possible
                // values: ...]` block is redundant + wraps awkwardly at
                // narrow terminal widths.
                .hide_possible_values(true);
        }
        _ => {}
    }
    arg
}

/// Rewrite tool descriptions (which are MCP-primary, naming tools as
/// `zsh_describe` / `zsh_classify` / etc.) into CLI-appropriate form
/// (`zshref describe` / `zshref classify` / ...). One line of text rewrite
/// here saves duplicating the descriptions on two sides of the seam.
fn cli_prose(s: &str) -> String {
    let mut out = s.to_string();
    for tool in [
        "zsh_classify",
        "zsh_search",
        "zsh_describe",
        "zsh_lookup_option",
    ] {
        let sub = subcommand_name(tool);
        out = out.replace(tool, &format!("zshref {sub}"));
    }
    out
}

/// Closed list of `DocCategory` values. Must mirror
/// `packages/zsh-core/src/docs/taxonomy.ts::docCategories`. The Rust CLI
/// carries this statically rather than deriving it from the corpus so that
/// `--help` and completion scripts advertise the exact valid set without
/// loading JSON.
pub const DOC_CATEGORIES: &[&str] = &[
    "option",
    "cond_op",
    "builtin",
    "precmd",
    "shell_param",
    "reserved_word",
    "redir",
    "process_subst",
    "param_expn",
    "subscript_flag",
    "param_flag",
    "history",
    "glob_op",
    "glob_flag",
    "prompt_escape",
    "zle_widget",
];

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
        output::emit(&result);
        return Ok(0);
    }

    let tool_name = format!("zsh_{sub_name}");
    let td = tool_defs
        .tools
        .iter()
        .find(|t| t.name == tool_name)
        .expect("subcommand registered from tool_defs");

    let result = tools::dispatch(td, sub_matches, corpus)?;
    output::emit(&result);
    Ok(0)
}
