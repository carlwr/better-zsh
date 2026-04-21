//! `zsh_classify` — port of `packages/zsh-core-tooldef/src/tools/classify.ts`.
//! Walks `classifyOrder`, returns the first category whose resolver matches.

use crate::corpus::Corpus;
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{json, Value};

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let raw = matches
        .get_one::<String>("raw")
        .map(String::as_str)
        .unwrap_or("");
    Ok(match classify(corpus, raw) {
        Some(m) => json!({ "match": Value::from(m) }),
        None => json!({ "match": Value::Null }),
    })
}

fn classify(corpus: &Corpus, raw: &str) -> Option<ClassifyMatch> {
    for cat_name in crate::corpus::CLASSIFY_ORDER {
        if let Some(m) = resolve_in(corpus, cat_name, raw) {
            return Some(m);
        }
    }
    None
}

pub struct ClassifyMatch {
    pub category: &'static str,
    pub id: String,
    pub display: String,
    pub markdown: String,
}

impl From<ClassifyMatch> for Value {
    fn from(m: ClassifyMatch) -> Value {
        json!({
            "category": m.category,
            "id": m.id,
            "display": m.display,
            "markdown": m.markdown,
        })
    }
}

/// Category-specific resolution. Mirrors the TS `resolvers` table in
/// `packages/zsh-core/src/docs/corpus.ts`. Covers the three non-trivial
/// cases (`option` with NO_ negation, `redir` with group-op + tail) plus a
/// default literal-lookup path for the simple resolvers.
fn resolve_in(corpus: &Corpus, cat_name: &str, raw: &str) -> Option<ClassifyMatch> {
    match cat_name {
        "option" => resolve_option_simple(corpus, raw),
        "redir" => resolve_redir(corpus, raw),
        _ => resolve_literal(corpus, cat_name, raw),
    }
}

fn resolve_literal(corpus: &Corpus, cat_name: &str, raw: &str) -> Option<ClassifyMatch> {
    let cat = corpus.category(cat_name)?;
    let trimmed = raw.trim();
    // The TS `mkDocumented` normalizer is category-specific; for the
    // categories routed here (everything except option/redir), either the
    // identity is case-sensitive and normalization is a trim, or the corpus
    // contains literal symbols. A straight `==` against id/display fields
    // covers both cases for classify's purposes.
    for rec in &cat.records {
        let id = record_id(cat_name, rec);
        let display = record_display(cat_name, rec);
        if id == trimmed || display == trimmed {
            return Some(mk_match(cat.name, id, display, rec));
        }
    }
    None
}

fn resolve_option_simple(corpus: &Corpus, raw: &str) -> Option<ClassifyMatch> {
    let cat = corpus.category("option")?;
    let norm = normalize_option(raw);
    // Literal first; on miss, try NO_ strip.
    if let Some(rec) = cat.records.iter().find(|r| record_id("option", r) == norm) {
        return Some(mk_match(
            cat.name,
            record_id("option", rec),
            record_display("option", rec),
            rec,
        ));
    }
    if let Some(stripped) = strip_no_prefix(raw) {
        let norm2 = normalize_option(&stripped);
        if let Some(rec) = cat.records.iter().find(|r| record_id("option", r) == norm2) {
            return Some(mk_match(
                cat.name,
                record_id("option", rec),
                record_display("option", rec),
                rec,
            ));
        }
    }
    None
}

/// Redirection resolver — port of `resolveRedir` in corpus.ts.
fn resolve_redir(corpus: &Corpus, raw: &str) -> Option<ClassifyMatch> {
    let cat = corpus.category("redir")?;
    let trimmed = raw.trim();
    // Strip a leading sequence of digits (fd number).
    let text: &str = {
        let mut i = 0;
        for (idx, ch) in trimmed.char_indices() {
            if ch.is_ascii_digit() {
                i = idx + ch.len_utf8();
            } else {
                break;
            }
        }
        &trimmed[i..]
    };
    if text.is_empty() {
        return None;
    }

    // Collect all redir docs.
    let docs: Vec<(&str, &str, &serde_json::Map<String, Value>)> = cat
        .records
        .iter()
        .map(|r| {
            let sig = r.get("sig").and_then(Value::as_str).unwrap_or("");
            let group_op = r.get("groupOp").and_then(Value::as_str).unwrap_or("");
            (sig, group_op, r)
        })
        .collect();

    // Longest matching group op.
    let mut group_op: Option<&str> = None;
    for (_, go, _) in &docs {
        if text.starts_with(go) {
            if group_op.map_or(true, |cur| go.len() > cur.len()) {
                group_op = Some(go);
            }
        }
    }
    let group_op = group_op?;

    // Candidates sharing the same group op.
    let matches: Vec<_> = docs.iter().filter(|(_, g, _)| *g == group_op).collect();
    if matches.len() == 1 {
        let (sig, _, rec) = matches[0];
        return Some(mk_match(cat.name, sig.to_string(), sig.to_string(), rec));
    }

    // Disambiguate by tail kind.
    let tail = &text[group_op.len()..];
    let want_kind = tail_kind_of(tail.trim_start());
    let narrowed: Vec<_> = matches
        .iter()
        .filter(|(sig, go, _)| doc_tail(sig, go.len()) == want_kind)
        .collect();
    if narrowed.len() == 1 {
        let (sig, _, rec) = narrowed[0];
        return Some(mk_match(cat.name, sig.to_string(), sig.to_string(), rec));
    }
    None
}

fn doc_tail(sig: &str, group_op_len: usize) -> &str {
    sig[group_op_len..].trim_start()
}

fn tail_kind_of(tail: &str) -> &str {
    if !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) {
        return "number";
    }
    if tail == "-" || tail == "p" {
        return tail;
    }
    if !tail.is_empty() {
        "word"
    } else {
        ""
    }
}

fn strip_no_prefix(raw: &str) -> Option<String> {
    let t = raw.trim();
    let lower = t.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("no_") {
        return Some(rest.to_string());
    }
    if let Some(rest) = lower.strip_prefix("no") {
        return Some(rest.to_string());
    }
    None
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

pub fn record_id(cat_name: &str, rec: &serde_json::Map<String, Value>) -> String {
    let key = match cat_name {
        "option" | "shell_param" | "builtin" | "precmd" | "reserved_word" | "zle_widget" => {
            "name"
        }
        "cond_op" | "glob_op" => "op",
        "redir" | "param_expn" => "sig",
        "subscript_flag" | "param_flag" | "glob_flag" => "flag",
        "history" | "prompt_escape" => "key",
        "process_subst" => "op",
        _ => "name",
    };
    rec.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

pub fn record_display(cat_name: &str, rec: &serde_json::Map<String, Value>) -> String {
    if cat_name == "option" {
        if let Some(s) = rec.get("display").and_then(Value::as_str) {
            return s.to_string();
        }
    }
    record_id(cat_name, rec)
}

fn mk_match(
    cat: &'static str,
    id: String,
    display: String,
    rec: &serde_json::Map<String, Value>,
) -> ClassifyMatch {
    let markdown = rec
        .get("markdown")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    ClassifyMatch {
        category: cat,
        id,
        display,
        markdown,
    }
}
