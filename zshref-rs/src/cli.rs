//! Dynamic clap::Command assembly driven by `tooldef.json`.
//!
//! Subcommand names are the tool names with the leading `zsh_` stripped
//! (matches the TS adapters). Value parsers are inferred from each
//! property's JSON Schema fragment: enum (`category`) → PossibleValues,
//! integer with bounds → u32 range, everything else → String.

mod prose;

use crate::corpus::{Corpus, ToolDef, ToolDefs, DOC_CATEGORIES};
use crate::output;
use crate::tools;
use anyhow::Result;
use clap::{Arg, ArgAction, ArgMatches, Command, ValueHint};
use serde_json::{json, Map, Value};

struct Ctx<'a> {
    tool_defs: &'a ToolDefs,
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
/// `Arg::hide(true)` solves (1) for `--help` rendering but `clap_complete`
/// (AOT generators, ≤4.6.5) does not filter hidden args from generated
/// shell completions. So we build two trees from the same source: `Parsing`
/// adds hidden `--pretty` to no-op subcommands; `Completions` omits them.
#[derive(Clone, Copy, Debug)]
pub enum BuildMode {
    Parsing,
    Completions,
}

pub fn subcommand_name(tool_name: &str) -> &str {
    tool_name.strip_prefix("zsh_").unwrap_or(tool_name)
}

/// Wrap a subcommand that doesn't natively use `--pretty` so that, in
/// `Parsing` mode, it still accepts the flag as a hidden no-op.
fn with_noop_pretty(cmd: Command, mode: BuildMode) -> Command {
    match mode {
        BuildMode::Parsing => cmd.arg(pretty_arg().hide(true)),
        BuildMode::Completions => cmd,
    }
}

pub fn build_cli(tool_defs: &ToolDefs, corpus: &Corpus, mode: BuildMode) -> Command {
    // Preamble uses MCP-primary `zsh_*` names; `prose::rewrite_refs` rewrites
    // them to `zshref *`. WARNING in `packages/zsh-core-tooldef/src/tool-defs.ts`
    // applies here too — tone/length drift on that source affects terminal help.
    let root_after_help = format!(
        "\n{}\n{}",
        prose::rewrite_refs(&tool_defs.preamble, &tool_defs.tools),
        prose::root_after_help_tail(tool_defs, corpus),
    );

    let mut root = Command::new(prose::BIN)
        .version(version_string(corpus))
        .about(prose::ROOT_BRIEF)
        .long_about(prose::ROOT_LONG)
        .override_usage(prose::ROOT_USAGE)
        .after_long_help(root_after_help)
        // Bare `zshref` is treated as an implicit help request:
        // `dispatch` routes the no-subcommand branch through `render_help`,
        // matching `zshref --help` byte-for-byte (CLI-POLICY.md).
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
        .arg(root_category_arg(&tool_defs.tools))
        .arg(help_arg())
        .arg(version_arg());

    for td in &tool_defs.tools {
        root = root.subcommand(build_subcommand(td, &tool_defs.tools, corpus));
    }

    root = root.subcommand(with_noop_pretty(
        Command::new("batch")
            .about(prose::BATCH_ABOUT)
            .after_long_help(prose::batch_long(tool_defs, corpus))
            .disable_help_flag(true)
            .arg(help_arg()),
        mode,
    ));

    root = root.subcommand(with_noop_pretty(
        Command::new("info")
            .about(prose::INFO_ABOUT)
            .disable_help_flag(true)
            .arg(help_arg()),
        mode,
    ));

    let (words, leaves) = tools::schema::size_hint(tool_defs);
    root = root.subcommand(
        Command::new("schema")
            .about(prose::schema_about(words))
            .after_long_help(prose::schema_long(words, leaves))
            .disable_help_flag(true)
            .arg(pretty_arg())
            .arg(help_arg()),
    );

    root = root.subcommand(with_noop_pretty(
        Command::new("completions")
            .about(prose::COMPL_ABOUT)
            .disable_help_flag(true)
            .arg(
                Arg::new("shell")
                    .value_name("SHELL")
                    .required(true)
                    .value_parser(clap::value_parser!(clap_complete::Shell))
                    .hide_possible_values(true)
                    .help(prose::COMPL_SHELL_HELP),
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
            .about(prose::HELP_ABOUT)
            .disable_help_flag(true)
            .arg(
                Arg::new("command")
                    .value_name("COMMAND")
                    .num_args(0..=1)
                    .value_parser(clap::builder::PossibleValuesParser::new(help_commands))
                    .hide_possible_values(true)
                    .help(prose::HELP_COMMAND_HELP),
            )
            .arg(help_arg()),
        mode,
    ));

    root
}

/// Multi-line `--version` string: pkg version, zsh upstream, corpus totals.
fn version_string(corpus: &Corpus) -> String {
    let pkg_version = env!("CARGO_PKG_VERSION");
    let up = &corpus.index.zsh_upstream;
    let total: usize = corpus.categories.iter().map(|c| c.records.len()).sum();
    let cats = corpus.categories.len();

    let commit_short: Option<String> =
        (!up.commit.is_empty()).then(|| up.commit.chars().take(8).collect());
    let upstream = prose::version_upstream_line(&up.tag, &up.date, commit_short.as_deref());
    let summary = prose::version_corpus_summary(total, cats);
    format!("{pkg_version}\n{upstream}\n{summary}")
}

fn build_subcommand(td: &ToolDef, tools: &[ToolDef], corpus: &Corpus) -> Command {
    let name = subcommand_name(&td.name).to_string();
    let after_help = tool_after_help(td, tools, corpus);
    let mut cmd = Command::new(name)
        .about(prose::rewrite_refs(&td.brief, tools))
        .after_long_help(after_help)
        .disable_help_flag(true)
        // Subcommand arg: `zshref docs … --pretty`.
        .arg(pretty_arg())
        .arg(help_arg());

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
        // `prose::rewrite_refs` rewrites `zsh_*` refs before render.
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

fn tool_after_help(td: &ToolDef, tools: &[ToolDef], corpus: &Corpus) -> String {
    let cli_description = prose::rewrite_refs(&prose::cli_tool_description(&td.description), tools);
    match tool_cli_example(td, corpus) {
        Some(example) => format!("{cli_description}\n\n{example}"),
        None => cli_description,
    }
}

fn tool_cli_example(td: &ToolDef, corpus: &Corpus) -> Option<String> {
    // Three examples for `docs`: `(.)` shows the resolver doing visible
    // work (key="(.)" → id="."; mdBody short, no elision); ALIASES /
    // NO_ALIASES make the resolver-table mapping concrete and show the
    // `feedback.kind` channel. Both ALIASES examples elide `mdBody`
    // (option records exceed the 80-col help budget by construction).
    let pairs: Vec<(&str, Value)> = match td.name.as_str() {
        "zsh_docs" => vec![
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
        "zsh_search" => vec![(
            "zshref search --query=autolo --limit=1 --pretty",
            json!({ "query": "autolo", "limit": 1 }),
        )],
        "zsh_list" => vec![(
            "zshref list --category=option --limit=1 --pretty",
            json!({ "category": "option", "limit": 1 }),
        )],
        _ => return None,
    };
    let outputs: Vec<String> = pairs
        .iter()
        .map(|(_, input)| {
            let mut value = tools::dispatch(td, input, corpus).expect("CLI help example must run");
            prose::elide_for_help_example(&mut value);
            output::render(&value, true)
        })
        .collect();
    let items: Vec<prose::ShellExample<'_>> = pairs
        .iter()
        .zip(outputs.iter())
        .map(|((command, _), output)| prose::ShellExample {
            prompt: command,
            continuations: &[],
            output: output.as_str(),
        })
        .collect();
    let block = prose::shell_examples(&items);
    // `docs` carries a trailing `jq -r` recipe: the JSON output of `docs` has
    // exactly one field most CLI users actually want piped into a `.md` file
    // (`mdBody`), and `jq -r` is the JSON-spec-correct interpreter of its
    // embedded escapes (`\n`, `\"`, `\\`, …) — saving callers from
    // hand-patching quoting.
    if td.name == "zsh_docs" {
        Some(format!("{block}\n\n{}", docs_md_recipe(td, corpus)))
    } else {
        Some(block)
    }
}

/// `!` (`conditional_op`) is the ideal record for this recipe: its `mdBody`
/// is 3 lines — short enough to render inline without help-block reflow —
/// and pairing with `--category` forces a single match (`!` overlaps 5
/// categories) which doubles as a demo of the narrowing idiom the recipe
/// needs anyway. Re-uses the same record as the root-level workflow example
/// so the worked example stays consistent across help surfaces.
fn docs_md_recipe(td: &ToolDef, corpus: &Corpus) -> String {
    let input = json!({ "key": "!", "category": "conditional_op" });
    let out = tools::dispatch(td, &input, corpus).expect("docs md recipe must run");
    let md_body = out["matches"][0]["mdBody"]
        .as_str()
        .expect("docs md recipe expects matches[0].mdBody to be a string");
    prose::labelled_example(
        "Recipe — extract just the markdown body:",
        prose::ShellExample {
            prompt: "zshref docs --key='!' --category=conditional_op",
            continuations: &["| jq -r '.matches[].mdBody'"],
            output: md_body,
        },
    )
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
        .long_help(prose::rewrite_refs(long_help, tools))
        .required(required)
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
            // Schema `default` → clap default; avoids Rust-side mirror constants.
            // The schema `description` already states the default, so suppress
            // clap's auto-appended "[default: …]" to avoid duplication.
            if let Some(d) = spec.get("default").and_then(Value::as_u64) {
                arg = arg.default_value(d.to_string()).hide_default_value(true);
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

fn pretty_arg() -> Arg {
    Arg::new("pretty")
        .long("pretty")
        .display_order(90)
        .action(ArgAction::SetTrue)
        .long_help(prose::ROOT_PRETTY_HELP)
}

/// Root-level `--category`. The brief and the (valid-values-listing) long
/// help are single-sourced from the embedded tooldef so the category list
/// can't drift from the subcommands. The generic (search/list) wording is
/// used deliberately: it is the common denominator across tools — `docs`
/// adds a one-match-per-category note only in its own subcommand help,
/// which would read as inaccurate at the root where `search`/`list` also
/// take `--category`.
fn root_category_arg(tools: &[ToolDef]) -> Arg {
    let cat = |name: &str| {
        tools.iter().find(|t| t.name == name).and_then(|t| {
            t.input_schema
                .get("properties")
                .and_then(|p| p.get("category"))
        })
    };
    // `zsh_list` carries the generic category description; `zsh_docs` would
    // carry the docs-specific (one-match) variant.
    let spec = cat("zsh_list").expect("zsh_list tooldef must expose a `category` property");
    let long_help = spec
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let brief = tools
        .iter()
        .find(|t| t.name == "zsh_list")
        .and_then(|t| t.flag_briefs.get("category").cloned())
        .unwrap_or_default();
    Arg::new("category")
        .long("category")
        .value_name("CATEGORY")
        .help(brief)
        .long_help(long_help)
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
        .help(prose::HELP_FLAG_HELP)
}

fn version_arg() -> Arg {
    // Custom so the description follows phrase form (clap default capitalizes).
    Arg::new("version")
        .short('V')
        .long("version")
        .action(ArgAction::Version)
        .help(prose::VERSION_FLAG_HELP)
}

pub fn dispatch(cmd: Command, tool_defs: &ToolDefs, corpus: &Corpus) -> Result<i32> {
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
        tool_defs,
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
                build_cli(ctx.tool_defs, ctx.corpus, BuildMode::Completions);
            clap_complete::generate(
                shell,
                &mut cmd_for_completions,
                prose::BIN,
                &mut std::io::stdout(),
            );
            Ok(0)
        }
        "info" => {
            output::emit_pretty(&tools::info::run(ctx.corpus)?);
            Ok(0)
        }
        "schema" => {
            output::emit(&tools::schema::run(ctx.tool_defs)?, ctx.pretty);
            Ok(0)
        }
        "batch" => crate::batch::run(ctx.tool_defs, ctx.corpus),
        "help" => {
            let command = sub_matches.get_one::<String>("command").map(String::as_str);
            Ok(render_help(cmd_for_err, command))
        }
        sub => {
            let tool_name = format!("zsh_{sub}");
            let td = ctx
                .tool_defs
                .tools
                .iter()
                .find(|t| t.name == tool_name)
                .expect("subcommand registered from tool_defs");
            let mut input = matches_to_input_value(td, sub_matches);
            forward_root_category(&mut input, td, &matches);
            output::emit(&tools::dispatch(td, &input, ctx.corpus)?, ctx.pretty);
            Ok(0)
        }
    }
}

fn render_help(mut cmd: Command, subcommand: Option<&str>) -> i32 {
    let args = match subcommand {
        Some(sub) => vec![prose::BIN, sub, "--help"],
        None => vec![prose::BIN, "--help"],
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
fn forward_root_category(input: &mut Value, td: &ToolDef, root: &ArgMatches) {
    let Ok(Some(category)) = root.try_get_one::<String>("category") else {
        return;
    };
    let accepts_category = td
        .input_schema
        .get("properties")
        .and_then(Value::as_object)
        .is_some_and(|props| props.contains_key("category"));
    if !accepts_category {
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
