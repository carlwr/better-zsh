//! Record field accessors over baked JSON.
//! `_id` / `_display` / `_subKind` field names project the
//! `docId` / `docDisplay` / `docSubKind` tables (`taxonomy.ts`) into JSON.
//
// MIRROR-OF: packages/zsh-core/src/docs/json-projection.ts

use serde_json::{Map, Value};

pub type Rec = Map<String, Value>;

/// Lookup a record's string field, returning `""` when absent/non-string.
pub fn str_field<'r>(rec: &'r Rec, key: &str) -> &'r str {
    rec.get(key).and_then(Value::as_str).unwrap_or("")
}

/// String input-field accessor: returns the value or `""` when missing.
pub fn str_input<'a>(input: &'a Value, name: &str) -> &'a str {
    input.get(name).and_then(Value::as_str).unwrap_or("")
}

/// Reads the baked `_id` field; falls back to `""` (drift caught by `corpus.rs` tests).
pub fn record_id(_cat_name: &str, rec: &Rec) -> String {
    str_field(rec, "_id").to_string()
}

/// Reads the baked `_display` field; falls back to `""`.
pub fn record_display(_cat_name: &str, rec: &Rec) -> String {
    str_field(rec, "_display").to_string()
}

/// Reads the baked `_subKind` field. `None` for categories where `docSubKind` is undefined.
pub fn record_sub_kind(_cat_name: &str, rec: &Rec) -> Option<String> {
    let s = str_field(rec, "_subKind");
    (!s.is_empty()).then(|| s.to_string())
}
