//! `zsh_docs` — port of `packages/zsh-core-tooldef/src/tools/docs.ts`.
//!
//! Resolves a raw token via per-category dispatch. Without `--category`
//! walks `crate::corpus::CLASSIFY_ORDER` and returns one match per
//! resolving category. Surfaces `negated` on every option-category match.

use crate::corpus::Corpus;
use crate::tools::shared::{
    mk_envelope, normalize_option, record_display, record_id, str_arg, str_field, strip_no_prefix,
    Rec,
};
use anyhow::Result;
use clap::ArgMatches;
use serde_json::{Map, Value};

pub fn run(matches: &ArgMatches, corpus: &Corpus) -> Result<Value> {
    let raw = str_arg(matches, "raw");
    let category = matches.get_one::<String>("category").map(String::as_str);

    let matches_vec: Vec<Value> = if raw.trim().is_empty() {
        Vec::new()
    } else {
        match category {
            Some(cat) => resolve_in(corpus, cat, raw).into_iter().collect(),
            None => crate::corpus::CLASSIFY_ORDER
                .iter()
                .filter_map(|cat| resolve_in(corpus, cat, raw))
                .collect(),
        }
    };

    let n = matches_vec.len();
    Ok(mk_envelope(matches_vec, n))
}

/// Per-category resolver dispatch with the "direct ∥ resolver, direct
/// preferred" rule:
///
///   1. Try `corpus[cat]` direct lookup (trimmed raw against literal id).
///   2. If that misses, fall back to the per-category resolver.
///
/// Direct precedence is load-bearing for template-key categories
/// (`job_spec`'s `%number` literal vs the `%string` resolver fallback,
/// `history`'s `!n` literal vs the digit-template resolver). See
/// DESIGN.md §"docs: direct ∥ resolver" and the matching comment in
/// `packages/zsh-core-tooldef/src/tools/docs.ts`.
fn resolve_in(corpus: &Corpus, cat_name: &str, raw: &str) -> Option<Value> {
    if let Some(v) = direct_lookup(corpus, cat_name, raw) {
        return Some(v);
    }
    match cat_name {
        "option" => resolve_option_via_resolver(corpus, raw),
        "redir" => resolve_redir(corpus, raw),
        "job_spec" => resolve_job_spec(corpus, raw),
        "special_function" => resolve_special_function(corpus, raw),
        _ => resolve_literal(corpus, cat_name, raw),
    }
}

fn direct_lookup(corpus: &Corpus, cat_name: &str, raw: &str) -> Option<Value> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let cat = corpus.category(cat_name)?;
    let rec = cat.records.iter().find(|r| record_id(cat_name, r) == trimmed)?;
    Some(mk_match(
        cat.name,
        record_id(cat_name, rec),
        record_display(cat_name, rec),
        rec,
        cat_name == "option",
        false,
    ))
}

const HOOK_NAMES: &[&str] = &[
    "chpwd",
    "periodic",
    "precmd",
    "preexec",
    "zshaddhistory",
    "zshexit",
];

fn resolve_job_spec(corpus: &Corpus, raw: &str) -> Option<Value> {
    let t = raw.trim();
    if !t.starts_with('%') {
        return None;
    }
    let key = match t {
        "%%" | "%+" | "%-" => t,
        _ => {
            let body = &t[1..];
            if body.is_empty() {
                return None;
            }
            if body.chars().all(|c| c.is_ascii_digit()) {
                "%number"
            } else if body.starts_with('?') {
                if body.len() > 1 {
                    "%?string"
                } else {
                    return None;
                }
            } else {
                "%string"
            }
        }
    };
    mk_match_by_id(corpus, "job_spec", key)
}

fn resolve_special_function(corpus: &Corpus, raw: &str) -> Option<Value> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    if let Some(stripped) = t.strip_suffix("_functions") {
        if HOOK_NAMES.contains(&stripped) {
            if let Some(m) = mk_match_by_id(corpus, "special_function", stripped) {
                return Some(m);
            }
        }
    }
    if t.starts_with("TRAP")
        && t.len() > 4
        && t[4..]
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return mk_match_by_id(corpus, "special_function", "TRAPNAL");
    }
    None
}

fn find_non_option(
    corpus: &Corpus,
    cat_name: &str,
    pred: impl Fn(&Rec) -> bool,
) -> Option<Value> {
    let cat = corpus.category(cat_name)?;
    let rec = cat.records.iter().find(|r| pred(r))?;
    Some(mk_match(
        cat.name,
        record_id(cat_name, rec),
        record_display(cat_name, rec),
        rec,
        false,
        false,
    ))
}

fn mk_match_by_id(corpus: &Corpus, cat_name: &str, id: &str) -> Option<Value> {
    find_non_option(corpus, cat_name, |r| record_id(cat_name, r) == id)
}

fn resolve_literal(corpus: &Corpus, cat_name: &str, raw: &str) -> Option<Value> {
    let trimmed = raw.trim();
    find_non_option(corpus, cat_name, |r| {
        record_id(cat_name, r) == trimmed || record_display(cat_name, r) == trimmed
    })
}

fn resolve_option_via_resolver(corpus: &Corpus, raw: &str) -> Option<Value> {
    let cat = corpus.category("option")?;
    let find = |norm: &str, negated: bool| -> Option<Value> {
        cat.records
            .iter()
            .find(|r| record_id("option", r) == norm)
            .map(|r| {
                mk_match(
                    cat.name,
                    record_id("option", r),
                    record_display("option", r),
                    r,
                    true,
                    negated,
                )
            })
    };
    find(&normalize_option(raw), false).or_else(|| {
        let stripped = strip_no_prefix(raw)?;
        find(&normalize_option(&stripped), true)
    })
}

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
            Some(mk_match(
                cat.name,
                sig.to_string(),
                sig.to_string(),
                rec,
                false,
                false,
            ))
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

fn mk_match(
    cat: &'static str,
    id: String,
    display: String,
    rec: &Rec,
    is_option: bool,
    negated: bool,
) -> Value {
    let mut m = Map::new();
    m.insert("category".into(), Value::String(cat.to_string()));
    m.insert("id".into(), Value::String(id));
    m.insert("display".into(), Value::String(display));
    m.insert(
        "markdown".into(),
        Value::String(str_field(rec, "markdown").to_string()),
    );
    if is_option {
        m.insert("negated".into(), Value::Bool(negated));
    }
    Value::Object(m)
}
