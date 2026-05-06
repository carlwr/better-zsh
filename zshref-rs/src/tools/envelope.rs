//! Result envelope + entry shape.
//
// MIRROR-OF: packages/zsh-core-tooldef/src/tools/shared/envelope.ts
// MIRROR-OF: packages/zsh-core-tooldef/src/tools/shared/entries.ts

use serde_json::{json, Map, Value};

/// Standard `{ matches, matchesReturned, matchesTotal }` envelope.
/// `total` is pre-truncation; for non-truncating tools (`docs`) pass `matches.len()`.
pub fn mk_envelope(matches: Vec<Value>, total: usize) -> Value {
    let returned = matches.len();
    json!({
        "matches": matches,
        "matchesReturned": returned,
        "matchesTotal": total,
    })
}

/// `{category, id, display, subKind?, score?}` entry for `list`/`search`.
/// Field insertion order matches the TS adapter (→ byte-equal JSON).
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
