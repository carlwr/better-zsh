//! `zshref batch` — JSONL loop over `tools::dispatch`. Each non-empty stdin
//! line: `{"tool":"<name>","input":{...}}` → one compact-JSON stdout line.
//! Per-request errors are in-band; exit 0 unless stdin I/O fails.

use crate::corpus::{Corpus, ToolDef, ToolDefs};
use crate::tools;
use anyhow::Result;
use serde_json::{json, Value};
use std::io::{BufRead, Write};

pub fn run(tool_defs: &ToolDefs, corpus: &Corpus) -> Result<i32> {
    let stdin = std::io::stdin().lock();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let response = handle_request(&line, tool_defs, corpus);
        let s = serde_json::to_string(&response).unwrap_or_else(|_| "null".into());
        writeln!(stdout, "{s}")?;
    }
    Ok(0)
}

fn handle_request(line: &str, tool_defs: &ToolDefs, corpus: &Corpus) -> Value {
    let req: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => return err(format!("invalid JSON: {e}")),
    };
    let tool = match req.get("tool").and_then(Value::as_str) {
        Some(s) => s,
        None => return err("missing `tool` field"),
    };
    let td = match tool_defs.tools.iter().find(|t| t.name == tool) {
        Some(t) => t,
        None => return err(format!("unknown tool: {tool}")),
    };
    let empty = Value::Object(Default::default());
    let raw_input = req.get("input").unwrap_or(&empty);
    if let Err(msg) = validate_input(td, raw_input) {
        return err(msg);
    }
    // Inject schema defaults so omitted fields (e.g. `limit`) behave as in CLI mode.
    let input = fill_defaults_from_schema(td, raw_input);
    match tools::dispatch(td, &input, corpus) {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => err(format!("{e:#}")),
    }
}

fn fill_defaults_from_schema(td: &ToolDef, input: &Value) -> Value {
    let mut obj = input.as_object().cloned().unwrap_or_default();
    let Some(props) = td.input_schema.get("properties").and_then(Value::as_object) else {
        return Value::Object(obj);
    };
    for (key, spec) in props {
        if !obj.contains_key(key) {
            if let Some(default) = spec.get("default") {
                obj.insert(key.clone(), default.clone());
            }
        }
    }
    Value::Object(obj)
}

/// Lightweight check: missing required, type mismatch, integer bounds.
/// Mirrors clap's validation without a full JSON Schema validator — schemas
/// are tiny and stable.
fn validate_input(td: &ToolDef, input: &Value) -> std::result::Result<(), String> {
    let obj = input
        .as_object()
        .ok_or_else(|| "`input` must be a JSON object".to_string())?;

    if let Some(required) = td.input_schema.get("required").and_then(Value::as_array) {
        for r in required.iter().filter_map(Value::as_str) {
            if !obj.contains_key(r) {
                return Err(format!("missing required field: `{r}`"));
            }
        }
    }

    let Some(props) = td.input_schema.get("properties").and_then(Value::as_object) else {
        return Ok(());
    };

    if td
        .input_schema
        .get("additionalProperties")
        .and_then(Value::as_bool)
        == Some(false)
    {
        for key in obj.keys() {
            if !props.contains_key(key) {
                return Err(format!("unknown field: `{key}`"));
            }
        }
    }

    for (key, spec) in props {
        let Some(value) = obj.get(key) else { continue };
        let ty = spec.get("type").and_then(Value::as_str).unwrap_or("string");
        match ty {
            "integer" => {
                let n = value
                    .as_i64()
                    .ok_or_else(|| format!("`{key}` must be an integer"))?;
                if let Some(min) = spec.get("minimum").and_then(Value::as_i64) {
                    if n < min {
                        return Err(format!("`{key}` must be >= {min} (got {n})"));
                    }
                }
                if let Some(max) = spec.get("maximum").and_then(Value::as_i64) {
                    if n > max {
                        return Err(format!("`{key}` must be <= {max} (got {n})"));
                    }
                }
            }
            "string" if !value.is_string() => {
                return Err(format!("`{key}` must be a string"));
            }
            _ => {}
        }
    }
    Ok(())
}

fn err(msg: impl Into<String>) -> Value {
    json!({ "ok": false, "error": msg.into() })
}
