//! Shared helpers for integration-style tests.
//!
//! Resolves the bundled `tooldef.json` (mirrors `build.rs`'s auto-detect:
//! vendored first, else the monorepo `dist/json/` sibling), compiles each
//! tool's `outputSchema` once, and offers a uniform validate-or-panic
//! entry point reused across `integration.rs` and `fuzz.rs`. Sharing here
//! is structural — both tests assert the same contract and the cost of
//! drifting validators across test files is silent coverage holes.
//!
//! `#[allow(dead_code)]` because Rust compiles each `tests/*.rs` as a
//! separate crate with its own copy of this module — not every test crate
//! exercises every helper, but they may in the future.

#![allow(dead_code)]

use jsonschema::{Draft, JSONSchema};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

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

/// Map a CLI subcommand to the tooldef name (`docs` → `zsh_docs`). `None`
/// for subcommands that don't have a tool schema (`info`, `schema`, …).
pub fn tool_for_subcommand(sub: &str) -> Option<&'static str> {
    match sub {
        "docs" => Some("zsh_docs"),
        "search" => Some("zsh_search"),
        "list" => Some("zsh_list"),
        _ => None,
    }
}
