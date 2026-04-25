//! Shared record-shape + arg helpers used by every tool module.
//!
//! Mirrors the field-projection tables (`docId`, `docDisplay`) in the TS
//! `packages/zsh-core/src/docs/taxonomy.ts`. Kept Rust-side rather than
//! parsed from a JSON manifest because the projections are stable
//! enumerations of static literal strings; a drift guard in `corpus.rs`
//! cross-checks the category list itself against `index.json`.

use clap::ArgMatches;
use serde_json::{json, Map, Value};

pub type Rec = Map<String, Value>;

/// Uniform `{ matches, matchesReturned, matchesTotal }` envelope returned
/// by every tool. `matchesReturned` is always `matches.len()`; `total` is
/// caller-supplied (pre-truncation count) — for tools that don't truncate
/// (`docs`), pass `matches.len()` again.
pub fn mk_envelope(matches: Vec<Value>, total: usize) -> Value {
    let returned = matches.len();
    json!({
        "matches": matches,
        "matchesReturned": returned,
        "matchesTotal": total,
    })
}

/// Lookup a record's string field, returning `""` when absent/non-string.
pub fn str_field<'r>(rec: &'r Rec, key: &str) -> &'r str {
    rec.get(key).and_then(Value::as_str).unwrap_or("")
}

/// String CLI arg accessor: returns the captured value or `""`.
pub fn str_arg<'a>(matches: &'a ArgMatches, name: &str) -> &'a str {
    matches
        .get_one::<String>(name)
        .map(String::as_str)
        .unwrap_or("")
}

/// Canonical id field per category — the TS `mkDocumented` brands.
pub fn record_id(cat_name: &str, rec: &Rec) -> String {
    let key = match cat_name {
        "option"
        | "shell_param"
        | "builtin"
        | "precmd"
        | "reserved_word"
        | "complex_command"
        | "zle_widget"
        | "keymap"
        | "special_function" => "name",
        "cond_op" | "glob_op" | "process_subst" | "arith_op" => "op",
        "redir" | "param_expn" => "sig",
        "subscript_flag" | "param_flag" | "glob_flag" | "glob_qualifier" => "flag",
        "history" | "prompt_escape" | "job_spec" => "key",
        _ => "name",
    };
    str_field(rec, key).to_string()
}

/// Display form per category. `option` carries a separate `display` field;
/// all others render as their id.
pub fn record_display(cat_name: &str, rec: &Rec) -> String {
    if cat_name == "option" {
        let d = str_field(rec, "display");
        if !d.is_empty() {
            return d.to_string();
        }
    }
    record_id(cat_name, rec)
}

/// Per-category typed sub-facet. Mirror of `docSubKind` in
/// `packages/zsh-core/src/docs/taxonomy.ts`. Categories with no
/// meaningful subKind return `None`; absent-or-empty fields also return
/// `None` so the JSON omits the key (matches TS `undefined`-drop).
pub fn record_sub_kind(cat_name: &str, rec: &Rec) -> Option<String> {
    let key = match cat_name {
        "cond_op" => "arity",
        "reserved_word" => "pos",
        "param_expn" => "subKind",
        "history" | "glob_op" | "zle_widget" => "kind",
        _ => return None,
    };
    let s = str_field(rec, key);
    (!s.is_empty()).then(|| s.to_string())
}

/// Return the non-empty remainder after stripping a case-insensitive `no_`
/// or `no` prefix from `raw`. `None` if `raw` doesn't begin with either.
pub fn strip_no_prefix(raw: &str) -> Option<String> {
    let lower = raw.trim().to_ascii_lowercase();
    lower
        .strip_prefix("no_")
        .or_else(|| lower.strip_prefix("no"))
        .map(str::to_string)
}

/// Option normalization: lowercase, strip underscores. Mirrors
/// `normalizeOptName` in `packages/zsh-core/src/docs/brands.ts`.
pub fn normalize_option(raw: &str) -> String {
    raw.trim()
        .chars()
        .filter(|c| *c != '_')
        .flat_map(char::to_lowercase)
        .collect()
}
