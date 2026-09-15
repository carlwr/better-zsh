//! Request input against a tool's `inputSchema`: validation and defaults.

use crate::tools::Tool;
use serde_json::Value;

/// Lightweight check: missing required, unknown fields, type mismatch,
/// integer bounds. Mirrors clap's validation without a full JSON Schema
/// validator — schemas are tiny and stable.
pub fn validate(tool: &Tool, input: &Value) -> Result<(), String> {
    let obj = input
        .as_object()
        .ok_or_else(|| "`input` must be a JSON object".to_string())?;

    if let Some(required) = tool.input_schema.get("required").and_then(Value::as_array) {
        for r in required.iter().filter_map(Value::as_str) {
            if !obj.contains_key(r) {
                return Err(format!("missing required field: `{r}`"));
            }
        }
    }

    let Some(props) = tool
        .input_schema
        .get("properties")
        .and_then(Value::as_object)
    else {
        return Ok(());
    };

    if tool
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

/// Inject schema defaults for omitted fields (e.g. `limit`).
pub fn fill_defaults(tool: &Tool, input: &Value) -> Value {
    let mut obj = input.as_object().cloned().unwrap_or_default();
    let Some(props) = tool
        .input_schema
        .get("properties")
        .and_then(Value::as_object)
    else {
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
