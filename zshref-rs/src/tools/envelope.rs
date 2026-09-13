//! Result envelope + entry shape.

use serde_json::{json, Map, Value};

/// The envelope's keys; the output schemas require exactly these.
pub const ENVELOPE_KEYS: [&str; 3] = ["matches", "matchesReturned", "matchesTotal"];

/// Standard `{ matches, matchesReturned, matchesTotal }` envelope.
/// `total` is pre-truncation; for non-truncating tools (`docs`) pass `matches.len()`.
pub fn mk_envelope(matches: Vec<Value>, total: usize) -> Value {
    let [k_matches, k_returned, k_total] = ENVELOPE_KEYS;
    let returned = matches.len();
    json!({
        k_matches: matches,
        k_returned: returned,
        k_total: total,
    })
}

/// `{category, id, display, subKind?, score?}` entry for `list`/`search`.
/// Insertion order is the output's key order.
pub fn mk_entry(
    category: &str,
    id: String,
    display: String,
    sub_kind: Option<String>,
    score: Option<f64>,
) -> Value {
    let mut obj = Map::new();
    obj.insert("category".into(), Value::String(category.to_string()));
    obj.insert("id".into(), Value::String(id));
    obj.insert("display".into(), Value::String(display));
    if let Some(sk) = sub_kind {
        obj.insert("subKind".into(), Value::String(sk));
    }
    if let Some(s) = score {
        obj.insert(
            "score".into(),
            Value::Number(serde_json::Number::from_f64(s).expect("score finite")),
        );
    }
    Value::Object(obj)
}
