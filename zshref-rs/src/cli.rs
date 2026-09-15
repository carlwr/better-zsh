//! Dynamic `clap::Command` assembly for the CLI surface.

mod help;

use crate::corpus::{Corpus, DOC_CATEGORIES};
use crate::output;
use crate::tools::schema::Shape;
use crate::tools::text::Target;
use crate::tools::{self, Field, Tool, ToolName, ToolSet};
use anyhow::Result;
use clap::{Arg, ArgAction, ArgMatches, Command, ValueHint};
use serde_json::{Map, Value, json};

/// `--pretty` is accepted at any position on any subcommand, but is a no-op
/// outside the JSON-emitting ones. `Arg::hide(true)` keeps a no-op `--pretty`
/// out of `--help` yet not out of generated completions — hence two trees
/// from one source: `Parsing` adds the hidden no-ops, `Completions` omits
/// them.
#[derive(Clone, Copy, Debug)]
pub enum BuildMode {
    Parsing,
    Completions,
}

/// In `Parsing` mode, the hidden no-op `--pretty` for a subcommand that
/// doesn't use it.
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
        .bin_name(help::BIN)
        .version(version_string(corpus))
        .about(help::ROOT_ABOUT)
        .override_usage(help::ROOT_USAGE)
        .after_long_help(root_after_help)
        // Bare `zshref` should match the explicit help path byte-for-byte.
        .disable_help_subcommand(true)
        .disable_help_flag(true)
        .disable_version_flag(true)
        .arg(pretty_arg())
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

    let words = tools::schema::bundle_words(tool_set);
    root = root.subcommand(
        Command::new("schema")
            .about(help::schema_about(words))
            .after_long_help(help::schema_long(words))
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
            let mut value = tool.call(input, corpus).expect("CLI help example must run");
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
    let out = tool.call(&input, corpus).expect("docs md recipe must run");
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
    let arg = Arg::new(key)
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
    match field.shape {
        Shape::Text => arg,
        Shape::Category => arg
            .value_parser(clap::builder::PossibleValuesParser::new(
                DOC_CATEGORIES.iter().map(|c| c.as_str()),
            ))
            // The long help lists the values; clap's inline block wraps badly.
            .hide_possible_values(true),
        Shape::Limit => arg.value_parser(clap::value_parser!(u32)),
    }
}

fn pretty_arg() -> Arg {
    Arg::new("pretty")
        .long("pretty")
        .display_order(90)
        .action(ArgAction::SetTrue)
        .long_help(help::PRETTY_HELP)
}

/// Root-level `--category`, with `list`'s brief and long help: the generic
/// (search/list) wording is the common denominator — `docs`' one-match-
/// per-category note would misread at the root.
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
            DOC_CATEGORIES.iter().map(|c| c.as_str()),
        ))
        .hide_possible_values(true)
}

fn help_arg() -> Arg {
    // `-h` shows the long help too; a truncated `-h` page reads as broken.
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

pub fn dispatch(mut cmd: Command, tool_set: &ToolSet, corpus: &Corpus) -> Result<i32> {
    let matches = match cmd.try_get_matches_from_mut(std::env::args_os()) {
        Ok(m) => m,
        Err(err) => return Ok(output::handle_clap_error(err)),
    };
    let Some((sub_name, sub_matches)) = matches.subcommand() else {
        return Ok(render_help(cmd, None));
    };
    let pretty = optional_flag(&matches, "pretty") || optional_flag(sub_matches, "pretty");

    match sub_name {
        "completions" => {
            let shell: clap_complete::Shell = *sub_matches
                .get_one::<clap_complete::Shell>("shell")
                .expect("clap enforces required");
            let mut cmd_for_completions = build_cli(tool_set, corpus, BuildMode::Completions);
            clap_complete::generate(
                shell,
                &mut cmd_for_completions,
                help::BIN,
                &mut std::io::stdout(),
            );
            Ok(0)
        }
        "info" => {
            output::emit_pretty(&tools::info::run(corpus));
            Ok(0)
        }
        "schema" => {
            output::emit(&tools::schema::run(tool_set), pretty);
            Ok(0)
        }
        "batch" => crate::batch::run(tool_set, corpus),
        "help" => {
            let command = sub_matches.get_one::<String>("command").map(String::as_str);
            Ok(render_help(cmd, command))
        }
        sub => {
            let tool = tool_set
                .by_stem(sub)
                .expect("subcommand registered from the tool set");
            let mut input = matches_to_input_value(tool, sub_matches);
            forward_root_category(&mut input, tool, &matches);
            output::emit(&tool.call(&input, corpus)?, pretty);
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
        Err(err) => output::handle_clap_error(err),
    }
}

/// A root-position `--category` (`zshref --category=C docs …`) applies when
/// the tool takes `category` and the subcommand position did not set it.
/// clap binds a post-subcommand `--category` to the subcommand, so only the
/// pre-subcommand form lands here.
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

/// clap matches → the tool's JSON `input` object; `batch` builds the same
/// shape from JSONL.
fn matches_to_input_value(tool: &Tool, matches: &ArgMatches) -> Value {
    let mut obj = Map::new();
    for field in &tool.fields {
        let key = field.key;
        let value = match field.shape {
            Shape::Text | Shape::Category => matches
                .get_one::<String>(key)
                .map(|v| Value::String(v.clone())),
            Shape::Limit => matches
                .get_one::<u32>(key)
                .map(|v| Value::Number((*v).into())),
        };
        if let Some(value) = value {
            obj.insert(key.to_string(), value);
        }
    }
    Value::Object(obj)
}
