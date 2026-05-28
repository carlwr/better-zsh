//! Shared helpers for the `zshref` integration test suite.
//!
//! Roles:
//!
//! 1. **Spawn-and-parse vocabulary.** `BIN`, `run_raw`, `run_json`,
//!    `assert_envelope`, `doc_categories` — the minimum surface for
//!    invoking the built binary and shaping its JSON responses.
//!    (Used by `properties.rs`, `cli_invariants.rs`.)
//! 2. **`outputSchema` validation.** `locate_tooldef_json`,
//!    `validator_for`, `validate_or_panic`, `tool_for_subcommand` —
//!    `run_json` auto-validates every tool-subcommand response against
//!    its bundled schema, so new tests get conformance checks for free.
//! 3. **`Example:` block parsing.** `extract_example` — pairs with
//!    `cli/prose.rs::shell_example`; used by `help_examples.rs` and
//!    `help_layout.rs`.
//!
//! `#[allow(dead_code)]` because Rust compiles each `tests/*.rs` as a
//! separate crate with its own copy of this module — items unused by
//! one test binary still warn unless suppressed at the module level.

#![allow(dead_code)]

use jsonschema::{Draft, JSONSchema};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

/// Path to the test crate's binary under test, baked in by Cargo.
pub const BIN: &str = env!("CARGO_BIN_EXE_zshref");

/// Spawn `zshref` with `args` and return the raw `Output`. Use for
/// byte-level assertions (determinism, exit code, stderr).
pub fn run_raw(args: &[&str]) -> std::process::Output {
    Command::new(BIN).args(args).output().expect("spawn zshref")
}

const NON_TOOL_SUBCOMMANDS: &[&str] = &[
    "batch",
    "info",
    "schema",
    #[cfg(feature = "nlp")]
    "nlp-search",
    "completions",
    "help",
];

pub fn tool_full_names() -> &'static [String] {
    static NAMES: OnceLock<Vec<String>> = OnceLock::new();
    NAMES.get_or_init(|| {
        let path = locate_tooldef_json();
        let bytes = fs::read(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
        let defs: Value = serde_json::from_slice(&bytes)
            .unwrap_or_else(|e| panic!("parse {}: {e}", path.display()));
        defs.get("tools")
            .and_then(Value::as_array)
            .expect("tools array")
            .iter()
            .map(|t| {
                t.get("name")
                    .and_then(Value::as_str)
                    .expect("tool.name")
                    .to_string()
            })
            .collect()
    })
}

/// `tool_full_names` with `zsh_` stripped.
pub fn tool_subcommands() -> &'static [String] {
    static SUBS: OnceLock<Vec<String>> = OnceLock::new();
    SUBS.get_or_init(|| {
        tool_full_names()
            .iter()
            .map(|n| n.strip_prefix("zsh_").unwrap_or(n).to_string())
            .collect()
    })
}

pub fn subcommands() -> &'static [String] {
    static ALL: OnceLock<Vec<String>> = OnceLock::new();
    ALL.get_or_init(|| {
        let mut v: Vec<String> = tool_subcommands().to_vec();
        v.extend(NON_TOOL_SUBCOMMANDS.iter().map(|s| (*s).to_string()));
        v
    })
}

pub fn run_with_env(args: &[&str], env: &[(&str, &str)]) -> std::process::Output {
    let mut cmd = Command::new(BIN);
    cmd.args(args);
    cmd.env_remove("NO_COLOR");
    cmd.env_remove("CLICOLOR_FORCE");
    cmd.env_remove("COLUMNS");
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd
        .output()
        .unwrap_or_else(|e| panic!("spawn zshref {args:?}: {e}"));
    assert!(
        out.status.success(),
        "zshref {args:?} exit {:?}; stderr:\n{}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr),
    );
    out
}

pub fn stdout_with_env(args: &[&str], env: &[(&str, &str)]) -> String {
    let out = run_with_env(args, env);
    String::from_utf8(out.stdout).expect("stdout is utf-8")
}

pub fn help_target_args() -> Vec<Vec<&'static str>> {
    let mut out: Vec<Vec<&'static str>> = vec![vec![], vec!["--help"], vec!["-h"]];
    for sub in subcommands() {
        out.push(vec![sub.as_str(), "--help"]);
        out.push(vec![sub.as_str(), "-h"]);
    }
    out
}

/// Spawn `zshref` with `args`, assert success, parse stdout as JSON,
/// and auto-validate against the tool's bundled `outputSchema` when
/// one exists. Subcommands without a schema (`info`, `schema`,
/// `completions`) are passed through unchecked.
pub fn run_json(args: &[&str]) -> Value {
    let out = run_raw(args);
    if !out.status.success() {
        panic!(
            "nonzero exit {:?} for args {:?}\nstderr:\n{}",
            out.status.code(),
            args,
            String::from_utf8_lossy(&out.stderr),
        );
    }
    let v: Value = serde_json::from_slice(&out.stdout).expect("stdout is valid JSON");
    if let Some(sub) = args.first() {
        if let Some(tool) = tool_for_subcommand(sub) {
            assert_tool_output_shape(args, &out);
            validate_or_panic(tool, &v);
        }
    }
    v
}

fn assert_tool_output_shape(args: &[&str], out: &std::process::Output) {
    assert!(
        out.stderr.is_empty(),
        "successful tool subcommand {args:?} wrote stderr:\n{}",
        String::from_utf8_lossy(&out.stderr),
    );
    assert!(
        out.stdout.ends_with(b"\n") && out.stdout.iter().filter(|b| **b == b'\n').count() == 1,
        "default tool output must be one compact JSON line for args {args:?}; stdout:\n{}",
        String::from_utf8_lossy(&out.stdout),
    );
}

/// Destructure the standard `{matches, matchesReturned, matchesTotal}`
/// envelope. Panics on shape mismatch.
pub fn assert_envelope(v: &Value) -> (&Vec<Value>, u64, u64) {
    let matches = v
        .get("matches")
        .and_then(Value::as_array)
        .expect("`matches` is an array");
    let returned = v
        .get("matchesReturned")
        .and_then(Value::as_u64)
        .expect("`matchesReturned` is u64");
    let total = v
        .get("matchesTotal")
        .and_then(Value::as_u64)
        .expect("`matchesTotal` is u64");
    (matches, returned, total)
}

/// Category list discovered from the running binary's own `info` output —
/// the canonical taxonomy (owned by zsh-core / baked into the binary).
/// Using this as the source of truth for test inputs means new categories
/// are automatically covered without hand-typed constants.
pub fn doc_categories() -> &'static [String] {
    static CATS: OnceLock<Vec<String>> = OnceLock::new();
    CATS.get_or_init(|| {
        let v = run_json(&["info"]);
        v.get("categories")
            .and_then(Value::as_array)
            .expect("`zshref info` emits a `categories` array")
            .iter()
            .filter_map(|x| x.as_str().map(str::to_owned))
            .collect()
    })
}

/// Find `tooldef.json` next to the binary's baked corpus; vendored copy
/// wins over monorepo sibling so a packaged crate validates against the
/// data it shipped with.
pub fn locate_tooldef_json() -> PathBuf {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let vendored = manifest.join("data/tooldef.json");
    if vendored.exists() {
        return vendored;
    }
    let monorepo = manifest.join("../packages/zsh-core-tooldef/dist/json/tooldef.json");
    if monorepo.exists() {
        return monorepo;
    }
    panic!(
        "no tooldef.json found at {} or {}",
        vendored.display(),
        monorepo.display()
    );
}

/// Compile-once-per-tool validator over the bundled `outputSchema`. Draft
/// 2020-12 to match the `$schema` declared in each per-tool schema.
pub fn validator_for(tool: &str) -> &'static JSONSchema {
    static VALIDATORS: OnceLock<HashMap<String, JSONSchema>> = OnceLock::new();
    VALIDATORS
        .get_or_init(|| {
            let path = locate_tooldef_json();
            let bytes = fs::read(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
            let defs: Value = serde_json::from_slice(&bytes)
                .unwrap_or_else(|e| panic!("parse {}: {e}", path.display()));
            let tools = defs
                .get("tools")
                .and_then(Value::as_array)
                .expect("tooldef.json: tools array");
            let mut out = HashMap::new();
            for t in tools {
                let name = t
                    .get("name")
                    .and_then(Value::as_str)
                    .expect("tool: name")
                    .to_string();
                let schema = t
                    .get("outputSchema")
                    .unwrap_or_else(|| panic!("tool {name}: missing outputSchema"));
                let compiled = JSONSchema::options()
                    .with_draft(Draft::Draft202012)
                    .compile(schema)
                    .unwrap_or_else(|e| panic!("compile outputSchema for {name}: {e}"));
                out.insert(name, compiled);
            }
            out
        })
        .get(tool)
        .unwrap_or_else(|| panic!("no validator for tool {tool:?}"))
}

/// Validate `v` against the named tool's `outputSchema`; panic with detail
/// on failure. `tool` uses the full bundled name (`zsh_docs`, …).
pub fn validate_or_panic(tool: &str, v: &Value) {
    let validator = validator_for(tool);
    if let Err(errors) = validator.validate(v) {
        let detail = errors
            .map(|e| format!("  - {e} (path: {})", e.instance_path))
            .collect::<Vec<_>>()
            .join("\n");
        panic!(
            "outputSchema validation failed for {tool}:\nactual:\n{}\nerrors:\n{detail}",
            serde_json::to_string_pretty(v).unwrap_or_default(),
        );
    }
}

/// Parse the first example from an `Example:` / `Examples:` block in
/// `--help` output. See `extract_examples` for the multi-example case.
pub fn extract_example(help: &str) -> Option<(String, String)> {
    extract_examples(help).into_iter().next()
}

/// Parse every example from an `Example:` / `Examples:` block in
/// `--help` output. See `extract_examples_under` — this is the common case
/// keyed on the default `Example:` / `Examples:` headings.
pub fn extract_examples(help: &str) -> Vec<(String, String)> {
    extract_examples_under(help, &["Example:", "Examples:"])
}

/// Parse every example from a `<heading>` block in `--help` output (e.g.
/// `Examples:`, `Typical workflow:`). Returns `(command, output)` pairs
/// where `command` is the full logical command (`\` continuations
/// absorbed and joined with single spaces) and `output` is the indented
/// prose lines below it (with the `    ` prefix stripped). Examples are
/// separated by a blank line followed by another `    $ ` prompt;
/// parsing stops at the first non-indented line — that's prose after the
/// block (e.g. batch's "Error response shape:" follows the JSON output).
///
/// `    $ # ...` shell-comment prompts (no-ops, but useful for narrating
/// a workflow) are skipped — they aren't commands to re-run.
///
/// Pairs with `cli/prose.rs::shell_examples`: prompt at 4-space indent,
/// continuations at 8-space indent, output at 4-space indent. Returns
/// an empty Vec if the help text has no matching heading or the layout
/// doesn't match (e.g. dangling `\` continuation, missing prompt).
pub fn extract_examples_under(help: &str, headings: &[&str]) -> Vec<(String, String)> {
    let lines: Vec<&str> = help.lines().collect();
    let Some(idx) = lines.iter().position(|l| headings.contains(l)) else {
        return Vec::new();
    };
    let mut cursor = idx + 1;
    let mut out = Vec::new();
    loop {
        loop {
            if cursor >= lines.len() {
                return out;
            }
            let line = lines[cursor];
            if line.is_empty() {
                cursor += 1;
                continue;
            }
            // Skip shell-comment prompts: `    $ # ...` is a no-op the
            // user could type — useful as inline narration but not a
            // command to re-run.
            if let Some(stripped) = line.strip_prefix("    $ ") {
                if stripped.starts_with('#') {
                    cursor += 1;
                    continue;
                }
            }
            break;
        }
        let Some(prompt) = lines.get(cursor).and_then(|l| l.strip_prefix("    $ ")) else {
            break;
        };
        let mut command = prompt.to_string();
        cursor += 1;
        while command.trim_end().ends_with('\\') {
            let Some(line) = lines.get(cursor) else {
                return Vec::new();
            };
            let Some(cont) = line.strip_prefix("    ") else {
                return Vec::new();
            };
            command = format!(
                "{} {}",
                command.trim_end().trim_end_matches('\\').trim_end(),
                cont.trim_start(),
            );
            cursor += 1;
        }
        let mut output = String::new();
        while cursor < lines.len() {
            let line = lines[cursor];
            if line.is_empty() {
                cursor += 1;
                break;
            }
            let Some(body) = line.strip_prefix("    ") else {
                break;
            };
            output.push_str(body);
            output.push('\n');
            cursor += 1;
        }
        out.push((command, output));
    }
    out
}

/// Map a CLI subcommand to the tooldef name (`docs` → `zsh_docs`). `None`
/// for subcommands that don't have a tool schema (`info`, `schema`, …).
pub fn tool_for_subcommand(sub: &str) -> Option<&'static str> {
    let target = format!("zsh_{sub}");
    tool_full_names()
        .iter()
        .find(|name| **name == target)
        .map(String::as_str)
}
