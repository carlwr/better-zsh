//! `zshref batch` — JSONL loop over `Tool::call`. Each non-empty stdin
//! line: `{"tool":"<name>","input":{...}}` → one compact-JSON stdout line.
//! Per-request errors are in-band; exit 0 unless stdin I/O fails.
//!
//! Programmatic callers must drain stdout concurrently with the stdin write
//! (e.g. write on a thread). Stdout (matches × `mdBody`) easily exceeds the
//! OS pipe buffer; otherwise the child blocks on stdout, stops reading
//! stdin, and a parent that completes stdin before reading stdout deadlocks.

use crate::corpus::Corpus;
use crate::tools::ToolSet;
use anyhow::Result;
use serde_json::{json, Value};
use std::io::{BufRead, Write};

pub fn run(tool_set: &ToolSet, corpus: &Corpus) -> Result<i32> {
    let stdin = std::io::stdin().lock();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let response = handle_request(&line, tool_set, corpus);
        let s = serde_json::to_string(&response).unwrap_or_else(|_| "null".into());
        writeln!(stdout, "{s}")?;
    }
    Ok(0)
}

fn handle_request(line: &str, tool_set: &ToolSet, corpus: &Corpus) -> Value {
    let req: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => return err(format!("invalid JSON: {e}")),
    };
    let name = match req.get("tool").and_then(Value::as_str) {
        Some(s) => s,
        None => return err("missing `tool` field"),
    };
    let empty = Value::Object(Default::default());
    let input = req.get("input").unwrap_or(&empty);
    if !input.is_object() {
        return err("`input` must be a JSON object");
    }
    let Some(tool) = tool_set.by_json(name) else {
        return err(format!("unknown tool: {name}"));
    };
    match tool.call(input, corpus) {
        Ok(output) => json!({ "ok": true, "output": output }),
        Err(e) => err(format!("{e:#}")),
    }
}

fn err(msg: impl Into<String>) -> Value {
    json!({ "ok": false, "error": msg.into() })
}
