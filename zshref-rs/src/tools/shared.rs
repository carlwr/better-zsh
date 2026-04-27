//! Shared record-shape + arg helpers used by every tool module.
//!
//! Identity fields (`_id`, `_display`, `_subKind`) are baked into the
//! per-category JSON at TS build time — no per-category dispatch needed here.
//! See `augmentWithMarkdown` in `packages/zsh-core/build.ts`.

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

/// Canonical id for a record — reads the baked `_id` field emitted by the
/// TS build. Falls back to `""` when absent (corpus drift guard in
/// `corpus.rs` will catch this before production).
pub fn record_id(_cat_name: &str, rec: &Rec) -> String {
    str_field(rec, "_id").to_string()
}

/// Display form for a record — reads the baked `_display` field emitted by
/// the TS build.
pub fn record_display(_cat_name: &str, rec: &Rec) -> String {
    str_field(rec, "_display").to_string()
}

/// Per-category typed sub-facet — reads the baked `_subKind` field emitted
/// by the TS build. Returns `None` for categories whose `docSubKind` returns
/// `undefined` (field is absent in the JSON).
pub fn record_sub_kind(_cat_name: &str, rec: &Rec) -> Option<String> {
    let s = str_field(rec, "_subKind");
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

/// Lossy-resolution feedback emitted by a per-category resolver. Mirrors
/// the TS `ResolverFeedback` closed kind-tagged union in
/// `packages/zsh-core/src/docs/resolvers.ts`. Today the option resolver is
/// the only emitter (`InputNegated` when reached via `NO_`-stripping); other
/// categories never carry feedback.
#[derive(Clone, Copy, Debug)]
pub enum ResolverFeedback {
    InputNegated,
}

impl ResolverFeedback {
    /// JSON `kind` discriminator string. Must match the TS literal in
    /// `ResolverFeedback["kind"]`.
    pub fn kind(self) -> &'static str {
        match self {
            ResolverFeedback::InputNegated => "input-negated",
        }
    }
}

/// A resolved corpus hit — the result of "direct ∥ resolver, direct
/// preferred" dispatch for one category. Carries enough to project either
/// docs' `{mdBody, feedback?}` shape or search's `(category, id)` dedup-key
/// + `Entry` lookup.
pub struct ResolvedHit<'c> {
    pub category: &'static str,
    pub id: String,
    pub display: String,
    pub rec: &'c Rec,
    /// Lossy-normalization feedback emitted by the resolver. `None` for
    /// loss-free or non-emitting paths.
    pub feedback: Option<ResolverFeedback>,
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
/// table in `packages/zsh-core/src/docs/resolvers.ts`.
pub fn resolve_in<'c>(corpus: &'c Corpus, cat_name: &str, raw: &str) -> Option<ResolvedHit<'c>> {
    if let Some(h) = direct_lookup(corpus, cat_name, raw) {
        return Some(h);
    }
    match cat_name {
        "option" => resolve_option_via_resolver(corpus, raw),
        "redir" => resolve_redir(corpus, raw),
        "history" => resolve_history(corpus, raw),
        "subscript_flag" | "param_flag" | "glob_flag" | "glob_qualifier" => {
            resolve_parens_agnostic_flag(corpus, cat_name, raw)
        }
        "job_spec" => resolve_job_spec(corpus, raw),
        "special_function" => resolve_special_function(corpus, raw),
        _ => resolve_literal(corpus, cat_name, raw),
    }
}

fn make_hit<'c>(
    cat: &'c crate::corpus::Category,
    rec: &'c Rec,
    id_override: Option<String>,
    feedback: Option<ResolverFeedback>,
) -> ResolvedHit<'c> {
    let id = id_override.unwrap_or_else(|| record_id(cat.name, rec));
    let display = record_display(cat.name, rec);
    ResolvedHit {
        category: cat.name,
        id,
        display,
        rec,
        feedback,
    }
}

fn find_by<'c>(
    corpus: &'c Corpus,
    cat_name: &str,
    pred: impl Fn(&Rec) -> bool,
    feedback: Option<ResolverFeedback>,
) -> Option<ResolvedHit<'c>> {
    let cat = corpus.category(cat_name)?;
    let rec = cat.records.iter().find(|r| pred(r))?;
    Some(make_hit(cat, rec, None, feedback))
}

fn find_by_id<'c>(
    corpus: &'c Corpus,
    cat_name: &str,
    id: &str,
    feedback: Option<ResolverFeedback>,
) -> Option<ResolvedHit<'c>> {
    find_by(corpus, cat_name, |r| record_id(cat_name, r) == id, feedback)
}

fn direct_lookup<'c>(corpus: &'c Corpus, cat_name: &str, raw: &str) -> Option<ResolvedHit<'c>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    find_by_id(corpus, cat_name, trimmed, None)
}

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
        if crate::corpus::HOOK_NAMES.contains(&stripped) {
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
    find_by_id(corpus, "option", &norm, None).or_else(|| {
        let stripped = strip_no_prefix(raw)?;
        let norm2 = normalize_option(&stripped);
        find_by_id(
            corpus,
            "option",
            &norm2,
            Some(ResolverFeedback::InputNegated),
        )
    })
}

fn resolve_history<'c>(corpus: &'c Corpus, raw: &str) -> Option<ResolvedHit<'c>> {
    let key = history_key(raw.trim())?;
    find_by_id(corpus, "history", key, None)
}

fn history_key(t: &str) -> Option<&'static str> {
    if t == "!!" {
        return Some("!!");
    }
    if t == "!#" {
        return Some("!#");
    }
    if t.starts_with("!{") && t.ends_with('}') && t.len() > 3 {
        return Some("!{...}");
    }

    if let Some(rest) = t.strip_prefix("!?") {
        if rest.is_empty() {
            return None;
        }
        let body = rest.strip_suffix('?').unwrap_or(rest);
        return (!body.is_empty()).then_some("!?str[?]");
    }

    if let Some(rest) = t.strip_prefix("!-") {
        return (!rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())).then_some("!-n");
    }

    if let Some(rest) = t.strip_prefix('!') {
        if rest.is_empty() {
            return None;
        }
        if rest.chars().all(|c| c.is_ascii_digit()) {
            return Some("!n");
        }
        if matches!(rest, "$" | "^" | "%" | "*") {
            return None;
        }
        return rest
            .chars()
            .all(|c| c != '!' && !c.is_whitespace())
            .then_some("!str");
    }

    if let Some(rest) = t.strip_prefix('^') {
        let second = rest.find('^')?;
        if second == 0 {
            return None;
        }
        return (!rest[second + 1..].is_empty()).then_some("!!");
    }

    None
}

fn resolve_parens_agnostic_flag<'c>(
    corpus: &'c Corpus,
    cat_name: &str,
    raw: &str,
) -> Option<ResolvedHit<'c>> {
    let t = raw.trim();
    if let Some(h) = find_by_id(corpus, cat_name, t, None) {
        return Some(h);
    }
    if !(t.starts_with('(') && t.ends_with(')') && t.len() >= 2) {
        return None;
    }

    let inner = &t[1..t.len() - 1];
    let stripped = match cat_name {
        "glob_flag" => inner.strip_prefix('#').unwrap_or(inner),
        "glob_qualifier" => inner.strip_prefix("#q").unwrap_or(inner),
        _ => inner,
    };
    if stripped.is_empty() {
        return None;
    }
    find_by_id(corpus, cat_name, stripped, None)
}

fn resolve_redir<'c>(corpus: &'c Corpus, raw: &str) -> Option<ResolvedHit<'c>> {
    let cat = corpus.category("redir")?;
    let text = raw.trim().trim_start_matches(|c: char| c.is_ascii_digit());
    if text.is_empty() {
        return None;
    }
    if text == "<<" || text == "<<-" {
        return None;
    }
    if let Some(delim) = text.strip_prefix("<<-") {
        if !delim.is_empty() {
            return find_by_id(corpus, "redir", "<<[-] word", None);
        }
    } else if text.starts_with("<<") && !text.starts_with("<<<") {
        let delim = &text[2..];
        if !delim.is_empty() {
            return find_by_id(corpus, "redir", "<<[-] word", None);
        }
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
