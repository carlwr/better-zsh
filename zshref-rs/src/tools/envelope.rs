//! Result envelope + entry shape.

use crate::corpus::DocCategory;
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
    category: DocCategory,
    id: &str,
    display: &str,
    sub_kind: Option<&str>,
    score: Option<f64>,
) -> Value {
    let mut obj = Map::new();
    obj.insert("category".into(), category.as_str().into());
    obj.insert("id".into(), id.into());
    obj.insert("display".into(), display.into());
    if let Some(sk) = sub_kind {
        obj.insert("subKind".into(), sk.into());
    }
    if let Some(s) = score {
        obj.insert(
            "score".into(),
            Value::Number(serde_json::Number::from_f64(s).expect("score finite")),
        );
    }
    Value::Object(obj)
}
