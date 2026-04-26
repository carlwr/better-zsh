//! Shared record-shape + arg helpers used by every tool module.
//!
//! Mirrors the field-projection tables (`docId`, `docDisplay`) in the TS
//! `packages/zsh-core/src/docs/taxonomy.ts`. Kept Rust-side rather than
//! parsed from a JSON manifest because the projections are stable
//! enumerations of static literal strings; a drift guard in `corpus.rs`
//! cross-checks the category list itself against `index.json`.

use crate::corpus::Corpus;
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

/// Build a `{category, id, display, subKind?, score?}` entry — shape shared
/// by `zsh_list` and `zsh_search`. Field order matches the TS adapter for
/// byte-equal JSON.
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
        "option" | "shell_param" | "builtin" | "precmd" | "reserved_word" | "complex_command"
        | "zle_widget" | "keymap" | "special_function" => "name",
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
///
/// `zle_widget` deliberately composites `kind:section` (matching TS),
/// surfacing both axes in one field. The schema's `subKind` enum is
/// derived from TS's `docSubKind` outputs, so any drift here surfaces as
/// a schema validation failure in `tests/fuzz.rs`.
pub fn record_sub_kind(cat_name: &str, rec: &Rec) -> Option<String> {
    if cat_name == "zle_widget" {
        let kind = str_field(rec, "kind");
        let section = str_field(rec, "section");
        if kind.is_empty() && section.is_empty() {
            return None;
        }
        return Some(format!("{kind}:{section}"));
    }
    if cat_name == "keymap" {
        // `d.isSpecial ? "special" : "regular"` in TS. Field is bool;
        // missing or non-bool falls back to `false` → `"regular"`.
        let is_special = rec
            .get("isSpecial")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        return Some(if is_special { "special" } else { "regular" }.to_string());
    }
    let key = match cat_name {
        "cond_op" | "arith_op" => "arity",
        "reserved_word" => "pos",
        "param_expn" => "subKind",
        "history" | "glob_op" | "job_spec" | "special_function" => "kind",
        "shell_param" | "prompt_escape" => "section",
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

/// A resolved corpus hit — the result of "direct ∥ resolver, direct
/// preferred" dispatch for one category. Carries enough to project either
/// docs' `{markdown, negated?}` shape or search's `(category, id)`
/// dedup-key + `Entry` lookup.
pub struct ResolvedHit<'c> {
    pub category: &'static str,
    pub id: String,
    pub display: String,
    pub rec: &'c Rec,
    /// `Some(bool)` only on `option`-category hits (mirrors TS `negated`
    /// on the `DocsMatch` shape).
    pub negated: Option<bool>,
}

/// Per-category resolver dispatch, "direct ∥ resolver, direct preferred":
///
///   1. Try `corpus[cat]` direct lookup (trimmed raw vs literal id).
///   2. On miss, fall back to the per-category resolver.
///
/// Direct precedence is load-bearing for template-key categories
/// (`job_spec`'s `%number` literal vs the `%string` template fallback;
/// `history`'s `!n` literal vs the digit template). See DESIGN.md §"docs:
/// direct ∥ resolver" and the matching comment in
/// `packages/zsh-core-tooldef/src/tools/docs.ts`.
///
/// Used by `docs` (single-category, walks `CLASSIFY_ORDER`) and `search`
/// (resolver tier between exact and prefix). Mirrors the TS resolver
/// table in `packages/zsh-core/src/docs/corpus.ts`.
pub fn resolve_in<'c>(corpus: &'c Corpus, cat_name: &str, raw: &str) -> Option<ResolvedHit<'c>> {
    if let Some(h) = direct_lookup(corpus, cat_name, raw) {
        return Some(h);
    }
    match cat_name {
        "option" => resolve_option_via_resolver(corpus, raw),
        "redir" => resolve_redir(corpus, raw),
        "job_spec" => resolve_job_spec(corpus, raw),
        "special_function" => resolve_special_function(corpus, raw),
        _ => resolve_literal(corpus, cat_name, raw),
    }
}

fn make_hit<'c>(
    cat: &'c crate::corpus::Category,
    rec: &'c Rec,
    id_override: Option<String>,
    negated: Option<bool>,
) -> ResolvedHit<'c> {
    let id = id_override.unwrap_or_else(|| record_id(cat.name, rec));
    let display = record_display(cat.name, rec);
    ResolvedHit {
        category: cat.name,
        id,
        display,
        rec,
        negated,
    }
}

fn find_by<'c>(
    corpus: &'c Corpus,
    cat_name: &str,
    pred: impl Fn(&Rec) -> bool,
    negated: Option<bool>,
) -> Option<ResolvedHit<'c>> {
    let cat = corpus.category(cat_name)?;
    let rec = cat.records.iter().find(|r| pred(r))?;
    Some(make_hit(cat, rec, None, negated))
}

fn find_by_id<'c>(
    corpus: &'c Corpus,
    cat_name: &str,
    id: &str,
    negated: Option<bool>,
) -> Option<ResolvedHit<'c>> {
    find_by(corpus, cat_name, |r| record_id(cat_name, r) == id, negated)
}

fn direct_lookup<'c>(corpus: &'c Corpus, cat_name: &str, raw: &str) -> Option<ResolvedHit<'c>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let negated = (cat_name == "option").then_some(false);
    find_by_id(corpus, cat_name, trimmed, negated)
}

const HOOK_NAMES: &[&str] = &[
    "chpwd",
    "periodic",
    "precmd",
    "preexec",
    "zshaddhistory",
    "zshexit",
];

fn resolve_job_spec<'c>(corpus: &'c Corpus, raw: &str) -> Option<ResolvedHit<'c>> {
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
    find_by_id(corpus, "job_spec", key, None)
}

fn resolve_special_function<'c>(corpus: &'c Corpus, raw: &str) -> Option<ResolvedHit<'c>> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    if let Some(stripped) = t.strip_suffix("_functions") {
        if HOOK_NAMES.contains(&stripped) {
            if let Some(h) = find_by_id(corpus, "special_function", stripped, None) {
                return Some(h);
            }
        }
    }
    if t.starts_with("TRAP")
        && t.len() > 4
        && t[4..]
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return find_by_id(corpus, "special_function", "TRAPNAL", None);
    }
    None
}

fn resolve_literal<'c>(corpus: &'c Corpus, cat_name: &str, raw: &str) -> Option<ResolvedHit<'c>> {
    let trimmed = raw.trim();
    find_by(
        corpus,
        cat_name,
        |r| record_id(cat_name, r) == trimmed || record_display(cat_name, r) == trimmed,
        None,
    )
}

fn resolve_option_via_resolver<'c>(corpus: &'c Corpus, raw: &str) -> Option<ResolvedHit<'c>> {
    let norm = normalize_option(raw);
    find_by_id(corpus, "option", &norm, Some(false)).or_else(|| {
        let stripped = strip_no_prefix(raw)?;
        let norm2 = normalize_option(&stripped);
        find_by_id(corpus, "option", &norm2, Some(true))
    })
}

fn resolve_redir<'c>(corpus: &'c Corpus, raw: &str) -> Option<ResolvedHit<'c>> {
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
    fn unique_hit<'c>(
        cat: &'c crate::corpus::Category,
        entries: &[&(&str, &str, &'c Rec)],
    ) -> Option<ResolvedHit<'c>> {
        if entries.len() == 1 {
            let (sig, _, rec) = entries[0];
            Some(make_hit(cat, rec, Some((*sig).to_string()), None))
        } else {
            None
        }
    }
    if let Some(v) = unique_hit(cat, &matched) {
        return Some(v);
    }

    let want_kind = tail_kind_of(text[group_op.len()..].trim_start());
    let narrowed: Vec<_> = matched
        .iter()
        .copied()
        .filter(|(sig, go, _)| sig[go.len()..].trim_start() == want_kind)
        .collect();
    unique_hit(cat, &narrowed)
}

fn tail_kind_of(tail: &str) -> &str {
    match tail {
        "" => "",
        "-" | "p" => tail,
        t if t.chars().all(|c| c.is_ascii_digit()) => "number",
        _ => "word",
    }
}
