//! Dynamic `clap::Command` assembly for the CLI surface.

mod help;

use crate::corpus::{Corpus, DOC_CATEGORIES};
use crate::output;
use crate::tools::text::Target;
use crate::tools::{self, Field, Tool, ToolName, ToolSet};
use anyhow::Result;
use clap::{Arg, ArgAction, ArgMatches, Command, ValueHint};
use serde_json::{json, Map, Value};

struct Ctx<'a> {
    tool_set: &'a ToolSet,
    corpus: &'a Corpus,
    pretty: bool,
}

/// Why this enum exists: `--pretty` is universally a valid request — for
/// JSON-emitting subcommands it changes output, for everything else it's a
/// no-op. We want both halves:
///
/// 1. Parse-time: `--pretty` accepted at any position on any subcommand
///    (so `zshref info --pretty`, `zshref help --pretty` etc. don't error).
/// 2. Tab-completion: only offer `--pretty` on subcommands where it
///    actually changes output.
///
/// `Arg::hide(true)` solves (1) for `--help` rendering, but completion
/// generation still sees hidden args. So we build two trees from the same
/// source: `Parsing` adds hidden `--pretty` to no-op subcommands;
/// `Completions` omits them.
#[derive(Clone, Copy, Debug)]
pub enum BuildMode {
    Parsing,
    Completions,
}

/// Wrap a subcommand that doesn't natively use `--pretty` so that, in
/// `Parsing` mode, it still accepts the flag as a hidden no-op.
fn with_noop_pretty(cmd: Command, mode: BuildMode) -> Command {
    match mode {
        BuildMode::Parsing => cmd.arg(pretty_arg().hide(true)),
        BuildMode::Completions => cmd,
    }
}

pub fn build_cli(tool_set: &ToolSet, corpus: &Corpus, mode: BuildMode) -> Command {
    let root_after_help = format!(
        "\n{}\n\n{}",
        tools::prose::preamble(Target::Terminal),
        help::root_after_help_tail(tool_set, corpus),
    );

    let mut root = Command::new(help::BIN)
        .version(version_string(corpus))
        .about(help::ROOT_ABOUT)
        .override_usage(help::ROOT_USAGE)
        .after_long_help(root_after_help)
        // Bare `zshref` should match the explicit help path byte-for-byte.
        .disable_help_subcommand(true)
        .disable_help_flag(true)
        .disable_version_flag(true)
        // Root-level `--pretty` is documented in `Options:` (the override
        // `Usage:` block hides it). Each JSON-emitting subcommand also
        // registers its own `--pretty`; `dispatch` OR's the two positions
        // so `zshref --pretty docs …` and `zshref docs --pretty` are equal.
        // Subcommands without native `--pretty` get a hidden no-op variant
        // in `Parsing` mode — see `BuildMode`.
        .arg(pretty_arg())
        // Root-position `--category`, mirroring root `--pretty`: documented
        // in `Options:` (the override `Usage:` block shows `[--category=C]`
        // per subcommand, conveying where it applies); `dispatch` forwards a
        // root-position value to the tool subcommand.
        .arg(root_category_arg(tool_set))
        .arg(help_arg())
        .arg(version_arg());

    for tool in &tool_set.tools {
        root = root.subcommand(build_subcommand(tool, corpus));
    }

    root = root.subcommand(with_noop_pretty(
        Command::new("batch")
            .about(help::BATCH_ABOUT)
            .after_long_help(help::batch_long(tool_set, corpus))
            .disable_help_flag(true)
            .arg(help_arg()),
        mode,
    ));

    root = root.subcommand(with_noop_pretty(
        Command::new("info")
            .about(help::INFO_ABOUT)
            .disable_help_flag(true)
            .arg(help_arg()),
        mode,
    ));

    let (words, leaves) = tools::schema::size_hint(tool_set);
    root = root.subcommand(
        Command::new("schema")
            .about(help::schema_about(words))
            .after_long_help(help::schema_long(words, leaves))
            .disable_help_flag(true)
            .arg(pretty_arg())
            .arg(help_arg()),
    );

    root = root.subcommand(with_noop_pretty(
        Command::new("completions")
            .about(help::COMPL_ABOUT)
            .disable_help_flag(true)
            .arg(
                Arg::new("shell")
                    .value_name("SHELL")
                    .required(true)
                    .value_parser(clap::value_parser!(clap_complete::Shell))
                    .hide_possible_values(true)
                    .help(help::COMPL_SHELL_HELP),
            )
            .arg(help_arg()),
        mode,
    ));

    let mut help_commands: Vec<String> = root
        .get_subcommands()
        .map(|cmd| cmd.get_name().to_string())
        .collect();
    help_commands.push("help".to_string());

    root = root.subcommand(with_noop_pretty(
        Command::new("help")
            .about(help::HELP_ABOUT)
            .disable_help_flag(true)
            .arg(
                Arg::new("command")
                    .value_name("COMMAND")
                    .num_args(0..=1)
                    .value_parser(clap::builder::PossibleValuesParser::new(help_commands))
                    .hide_possible_values(true)
                    .help(help::HELP_COMMAND_HELP),
            )
            .arg(help_arg()),
        mode,
    ));

    root
}

/// Multi-line `--version` string: pkg version, zsh upstream, corpus totals.
/// Shared by both binaries; each prefixes its own name.
pub fn version_string(corpus: &Corpus) -> String {
    let pkg_version = env!("CARGO_PKG_VERSION");
    let up = &corpus.index.zsh_upstream;
    let total: usize = corpus.categories.iter().map(|c| c.records.len()).sum();
    let cats = corpus.categories.len();

    let commit_short: Option<String> =
        (!up.commit.is_empty()).then(|| up.commit.chars().take(8).collect());
    let upstream = help::version_upstream_line(&up.tag, &up.date, commit_short.as_deref());
    let summary = help::version_corpus_summary(total, cats);
    format!("{pkg_version}\n{upstream}\n{summary}")
}

fn build_subcommand(tool: &Tool, corpus: &Corpus) -> Command {
    let mut cmd = Command::new(tool.name.to_string())
        .about(tool.prose.brief.to_string())
        .after_long_help(tool_after_help(tool, corpus))
        .disable_help_flag(true)
        // Subcommand arg: `zshref docs … --pretty`.
        .arg(pretty_arg())
        .arg(help_arg());
    for field in &tool.fields {
        cmd = cmd.arg(build_arg(field));
    }
    cmd
}

fn tool_after_help(tool: &Tool, corpus: &Corpus) -> String {
    format!(
        "{}\n\n{}",
        tool.prose.long.terminal,
        tool_cli_example(tool, corpus)
    )
}

/// Compact examples that still exercise resolver normalization, resolver
/// feedback and help-output elision.
fn tool_cli_example(tool: &Tool, corpus: &Corpus) -> String {
    let pairs: Vec<(&str, Value)> = match tool.name {
        ToolName::Docs => vec![
            ("zshref docs --key='(.)' --pretty", json!({ "key": "(.)" })),
            (
                "zshref docs --key=ALIASES --pretty",
                json!({ "key": "ALIASES" }),
            ),
            (
                "zshref docs --key=NO_ALIASES --pretty",
                json!({ "key": "NO_ALIASES" }),
            ),
        ],
        ToolName::Search => vec![(
            "zshref search --query=autolo --limit=1 --pretty",
            json!({ "query": "autolo", "limit": 1 }),
        )],
        ToolName::List => vec![(
            "zshref list --category=option --limit=1 --pretty",
            json!({ "category": "option", "limit": 1 }),
        )],
    };
    let outputs: Vec<String> = pairs
        .iter()
        .map(|(_, input)| {
            let mut value =
                tools::dispatch(tool, input, corpus).expect("CLI help example must run");
            help::elide_for_help_example(&mut value);
            output::render(&value, true)
        })
        .collect();
    let items: Vec<help::ShellExample<'_>> = pairs
        .iter()
        .zip(outputs.iter())
        .map(|((command, _), output)| help::ShellExample {
            prompt: command,
            continuations: &[],
            output: output.as_str(),
        })
        .collect();
    let block = help::shell_examples(&items);
    if tool.name == ToolName::Docs {
        format!("{block}\n\n{}", docs_md_recipe(tool, corpus))
    } else {
        block
    }
}

/// Only `docs` gets a recipe: raw JSON strings are easy to mis-handle at
/// the terminal. Uses a compact record that needs category narrowing, so
/// the recipe shows the intended filter without bloating help output.
fn docs_md_recipe(tool: &Tool, corpus: &Corpus) -> String {
    let input = json!({ "key": "!", "category": "conditional_op" });
    let out = tools::dispatch(tool, &input, corpus).expect("docs md recipe must run");
    let md_body = out["matches"][0]["mdBody"]
        .as_str()
        .expect("docs md recipe expects matches[0].mdBody to be a string");
    help::labelled_example(
        "Recipe — extract just the markdown body:",
        help::ShellExample {
            prompt: "zshref docs --key='!' --category=conditional_op",
            continuations: &["| jq -r '.matches[].mdBody'"],
            output: md_body,
        },
    )
}

fn build_arg(field: &Field) -> Arg {
    let key = field.key;
    let spec = &field.shape;
    let mut arg = Arg::new(key)
        .long(key)
        .value_name(key.to_uppercase())
        .help(field.prose.brief.to_string())
        .long_help(field.prose.long.terminal.to_string())
        .required(field.required)
        .action(ArgAction::Set)
        .value_hint(ValueHint::Other)
        // zsh tokens include `-`, `-p`, fd prefixes (`2>`), etc.
        // Without this, `--key -p` errors; `--key=VALUE` is the only escape.
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
            // Schema `default` → clap default: the one source, as for
            // `tools::input`. The schema `description` already states it, so
            // suppress clap's auto-appended "[default: …]".
            if let Some(d) = spec.get("default").and_then(Value::as_u64) {
                arg = arg.default_value(d.to_string()).hide_default_value(true);
            }
        }
        "string"
            // The `category` flag has a closed enum — expose as PossibleValues
            // so clap generates a clean error + completion for bad inputs.
            // Detected by name rather than from the schema `enum`: the list
            // is the corpus' either way.
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

fn pretty_arg() -> Arg {
    Arg::new("pretty")
        .long("pretty")
        .display_order(90)
        .action(ArgAction::SetTrue)
        .long_help(help::PRETTY_HELP)
}

/// Root-level `--category`. The brief and the (valid-values-listing) long
/// help are `list`'s, so the category list can't drift from the
/// subcommands. The generic (search/list) wording is the common
/// denominator across tools — `docs` adds a one-match-per-category note
/// only in its own subcommand help, which would read as inaccurate at the
/// root where `search`/`list` also take `--category`.
fn root_category_arg(tool_set: &ToolSet) -> Arg {
    let category = tool_set
        .get(ToolName::List)
        .fields
        .iter()
        .find(|f| f.key == "category")
        .expect("list takes a `category`");
    Arg::new("category")
        .long("category")
        .value_name("CATEGORY")
        .help(category.prose.brief.to_string())
        .long_help(category.prose.long.terminal.to_string())
        .action(ArgAction::Set)
        .value_parser(clap::builder::PossibleValuesParser::new(
            DOC_CATEGORIES.as_slice(),
        ))
        // Description already lists categories; the inline block is redundant
        // and wraps badly at narrow widths (matches the subcommand arg).
        .hide_possible_values(true)
}

fn help_arg() -> Arg {
    // `-h` and `--help` share one row and show the same (long) help; the
    // short/long distinction adds no value here and lets `-h` look truncated.
    Arg::new("help")
        .short('h')
        .long("help")
        .action(ArgAction::HelpLong)
        .help(help::HELP_FLAG_HELP)
}

fn version_arg() -> Arg {
    // Custom so the description follows phrase form (clap default capitalizes).
    Arg::new("version")
        .short('V')
        .long("version")
        .action(ArgAction::Version)
        .help(help::VERSION_FLAG_HELP)
}

pub fn dispatch(cmd: Command, tool_set: &ToolSet, corpus: &Corpus) -> Result<i32> {
    let mut cmd_for_err = cmd.clone();
    let matches = match cmd.try_get_matches_from(std::env::args_os()) {
        Ok(m) => m,
        Err(err) => return Ok(output::handle_clap_error(err, &mut cmd_for_err)),
    };
    let Some((sub_name, sub_matches)) = matches.subcommand() else {
        return Ok(render_help(cmd_for_err, None));
    };
    // `--pretty` accepted at root or on the subcommand; OR the two.
    let ctx = Ctx {
        tool_set,
        corpus,
        pretty: optional_flag(&matches, "pretty") || optional_flag(sub_matches, "pretty"),
    };

    match sub_name {
        "completions" => {
            let shell: clap_complete::Shell = *sub_matches
                .get_one::<clap_complete::Shell>("shell")
                .expect("clap enforces required");
            // Rebuild from the same source with `Completions` mode so that
            // hidden no-op `--pretty` args don't surface as tab-completion
            // offers on info/batch/help/completions.
            let mut cmd_for_completions =
                build_cli(ctx.tool_set, ctx.corpus, BuildMode::Completions);
            clap_complete::generate(
                shell,
                &mut cmd_for_completions,
                help::BIN,
                &mut std::io::stdout(),
            );
            Ok(0)
        }
        "info" => {
            output::emit_pretty(&tools::info::run(ctx.corpus)?);
            Ok(0)
        }
        "schema" => {
            output::emit(&tools::schema::run(ctx.tool_set)?, ctx.pretty);
            Ok(0)
        }
        "batch" => crate::batch::run(ctx.tool_set, ctx.corpus),
        "help" => {
            let command = sub_matches.get_one::<String>("command").map(String::as_str);
            Ok(render_help(cmd_for_err, command))
        }
        sub => {
            let tool = ctx
                .tool_set
                .by_stem(sub)
                .expect("subcommand registered from the tool set");
            let mut input = matches_to_input_value(tool, sub_matches);
            forward_root_category(&mut input, tool, &matches);
            output::emit(&tools::dispatch(tool, &input, ctx.corpus)?, ctx.pretty);
            Ok(0)
        }
    }
}

fn render_help(mut cmd: Command, subcommand: Option<&str>) -> i32 {
    let args = match subcommand {
        Some(sub) => vec![help::BIN, sub, "--help"],
        None => vec![help::BIN, "--help"],
    };
    match cmd.try_get_matches_from_mut(args) {
        Ok(_) => 0,
        Err(err) => output::handle_clap_error(err, &mut cmd),
    }
}

/// Forward a root-position `--category` onto the tool input, mirroring the
/// root-position `--pretty` handling: a value given before the subcommand
/// (`zshref --category=C docs …`) applies when the tool accepts `category`
/// and the subcommand position did not set it. `matches_to_input_value`
/// (sub position) wins on conflict; clap binds a post-subcommand
/// `--category` to the sub, so this only fires for the pre-subcommand form.
fn forward_root_category(input: &mut Value, tool: &Tool, root: &ArgMatches) {
    let Ok(Some(category)) = root.try_get_one::<String>("category") else {
        return;
    };
    if !tool.fields.iter().any(|f| f.key == "category") {
        return;
    }
    if let Value::Object(map) = input {
        map.entry("category".to_string())
            .or_insert_with(|| Value::String(category.clone()));
    }
}

fn optional_flag(matches: &ArgMatches, key: &str) -> bool {
    matches.try_contains_id(key).unwrap_or(false) && matches.get_flag(key)
}

/// Convert `ArgMatches` → JSON object matching the tool's `inputSchema`.
/// Single boundary between clap-typed values and `&Value` dispatch;
/// `batch::run` builds the same shape from JSONL.
fn matches_to_input_value(tool: &Tool, matches: &ArgMatches) -> Value {
    let mut obj = Map::new();
    for field in &tool.fields {
        let key = field.key;
        let ty = field
            .shape
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("string");
        match ty {
            "integer" => {
                if let Some(v) = matches.get_one::<u32>(key) {
                    obj.insert(key.to_string(), Value::Number((*v).into()));
                }
            }
            _ => {
                if let Some(v) = matches.get_one::<String>(key) {
                    obj.insert(key.to_string(), Value::String(v.clone()));
                }
            }
        }
    }
    Value::Object(obj)
}
