//! `zsh_classify` — port of `packages/zsh-core-tooldef/src/tools/classify.ts`.
//! Walks `classifyOrder`, returns the first category whose resolver matches.
//!
//! Also hosts the shared record-field helpers (`str_field`, `record_id`,
//! `record_display`, `normalize_option`, `strip_no_prefix`) used by the
//! other three tools. Keeping them here tracks the TS side, which colocates
//! them with the classify resolver table in `zsh-core/src/docs/corpus.ts`.

use crate::corpus::Corpus;
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{json, Map, Value};

type Rec = Map<String, Value>;

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let raw = str_arg(matches, "raw");
    let m = crate::corpus::CLASSIFY_ORDER
        .iter()
        .find_map(|cat| resolve_in(corpus, cat, raw));
    Ok(json!({ "match": m.unwrap_or(Value::Null) }))
}

fn resolve_in(corpus: &Corpus, cat_name: &str, raw: &str) -> Option<Value> {
    match cat_name {
        "option" => resolve_option_simple(corpus, raw),
        "redir" => resolve_redir(corpus, raw),
        _ => resolve_literal(corpus, cat_name, raw),
    }
}

fn resolve_literal(corpus: &Corpus, cat_name: &str, raw: &str) -> Option<Value> {
    let cat = corpus.category(cat_name)?;
    let trimmed = raw.trim();
    // For categories routed here (everything except option/redir), identity
    // is either case-sensitive or the corpus contains literal symbols.
    // Straight `==` against id/display suffices for classify's purposes.
    cat.records
        .iter()
        .find(|r| record_id(cat_name, r) == trimmed || record_display(cat_name, r) == trimmed)
        .map(|r| {
            mk_match(
                cat.name,
                record_id(cat_name, r),
                record_display(cat_name, r),
                r,
            )
        })
}

fn resolve_option_simple(corpus: &Corpus, raw: &str) -> Option<Value> {
    let cat = corpus.category("option")?;
    let find = |norm: &str| {
        cat.records
            .iter()
            .find(|r| record_id("option", r) == norm)
            .map(|r| {
                mk_match(
                    cat.name,
                    record_id("option", r),
                    record_display("option", r),
                    r,
                )
            })
    };
    find(&normalize_option(raw)).or_else(|| {
        let stripped = strip_no_prefix(raw)?;
        find(&normalize_option(&stripped))
    })
}

/// Redirection resolver — port of `resolveRedir` in corpus.ts. Strip leading
/// fd digits, pick the longest matching `groupOp`, disambiguate the tail.
fn resolve_redir(corpus: &Corpus, raw: &str) -> Option<Value> {
    let cat = corpus.category("redir")?;
    let text = raw.trim().trim_start_matches(|c: char| c.is_ascii_digit());
    if text.is_empty() {
        return None;
    }

    let docs: Vec<(&str, &str, &Rec)> = cat
        .records
        .iter()
        .map(|r| (str_field(r, "sig"), str_field(r, "groupOp"), r))
        .collect();

    let group_op = docs
        .iter()
        .filter(|(_, g, _)| text.starts_with(*g))
        .map(|(_, g, _)| *g)
        .max_by_key(|g| g.len())?;

    let matched: Vec<_> = docs.iter().filter(|(_, g, _)| *g == group_op).collect();
    let unique = |entries: &[&(&str, &str, &Rec)]| -> Option<Value> {
        if entries.len() == 1 {
            let (sig, _, rec) = entries[0];
            Some(mk_match(cat.name, sig.to_string(), sig.to_string(), rec))
        } else {
            None
        }
    };
    if let Some(v) = unique(&matched) {
        return Some(v);
    }

    let want_kind = tail_kind_of(text[group_op.len()..].trim_start());
    let narrowed: Vec<_> = matched
        .iter()
        .copied()
        .filter(|(sig, go, _)| sig[go.len()..].trim_start() == want_kind)
        .collect();
    unique(&narrowed)
}

fn tail_kind_of(tail: &str) -> &str {
    match tail {
        "" => "",
        "-" | "p" => tail,
        t if t.chars().all(|c| c.is_ascii_digit()) => "number",
        _ => "word",
    }
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
        "option" | "shell_param" | "builtin" | "precmd" | "reserved_word" | "zle_widget" => "name",
        "cond_op" | "glob_op" | "process_subst" => "op",
        "redir" | "param_expn" => "sig",
        "subscript_flag" | "param_flag" | "glob_flag" => "flag",
        "history" | "prompt_escape" => "key",
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

fn mk_match(cat: &'static str, id: String, display: String, rec: &Rec) -> Value {
    json!({
        "category": cat,
        "id": id,
        "display": display,
        "markdown": str_field(rec, "markdown"),
    })
}
