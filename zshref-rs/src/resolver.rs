//! Per-category resolver dispatch and lossy-resolution feedback.
//! See DESIGN.md §"Resolver feedback channel".
//
// MIRROR-OF: packages/zsh-core/src/docs/resolver.ts
// MIRROR-OF: packages/zsh-core/src/docs/normalize-option.ts

use crate::corpus::Corpus;
use crate::tools::record_fields::{record_display, record_id, str_field, Rec};

/// Return the non-empty remainder after stripping a case-insensitive `no_`
/// or `no` prefix from `raw`. `None` if `raw` doesn't begin with either.
pub fn strip_no_prefix(raw: &str) -> Option<String> {
    let lower = raw.trim().to_ascii_lowercase();
    lower
        .strip_prefix("no_")
        .or_else(|| lower.strip_prefix("no"))
        .map(str::to_string)
}

/// Lowercase + strip underscores. Mirrors `normalizeOptName` in `normalize-option.ts`.
pub fn normalize_option(raw: &str) -> String {
    raw.trim()
        .chars()
        .filter(|c| *c != '_')
        .flat_map(char::to_lowercase)
        .collect()
}

/// Lossy-resolution feedback from a per-category resolver. Mirrors the TS
/// `ResolverFeedback` union in `resolvers.ts`.
///
/// - `InputNegated`: option name reached via `NO_`-stripping.
/// - `Subscripted(inner)`: special-parameter name reached by stripping a
///   trailing `[inner]` subscript (e.g. `compstate[context]` → `compstate`).
#[derive(Clone, Debug)]
pub enum ResolverFeedback {
    InputNegated,
    Subscripted(String),
}

impl ResolverFeedback {
    /// Serialize to the JSON object shape required by the bundled
    /// `outputSchema`'s `$defs.Feedback`. Mirrors `resolverFeedbackKindSchemas`
    /// in TS — kind values must match `ResolverFeedback["kind"]` literals.
    pub fn to_json(&self) -> serde_json::Value {
        match self {
            ResolverFeedback::InputNegated => serde_json::json!({ "kind": "input-negated" }),
            ResolverFeedback::Subscripted(s) => serde_json::json!({
                "kind": "subscripted",
                "subscript": s,
            }),
        }
    }
}

/// Resolved corpus hit from "direct ∥ resolver, direct preferred" dispatch.
/// Carries enough for both docs' `{mdBody, feedback?}` and search's dedup-key + entry.
pub struct ResolvedHit<'c> {
    pub category: &'static str,
    pub id: String,
    pub display: String,
    pub rec: &'c Rec,
    /// `None` for loss-free paths or non-emitting categories.
    pub feedback: Option<ResolverFeedback>,
}

/// Per-category resolver dispatch. See DESIGN.md §"docs: direct ∥ resolver"
/// and `lookupRaw` in zsh-core.
pub fn resolve_in<'c>(corpus: &'c Corpus, cat_name: &str, raw: &str) -> Option<ResolvedHit<'c>> {
    if let Some(h) = direct_lookup(corpus, cat_name, raw) {
        return Some(h);
    }
    match cat_name {
        "option" => resolve_option_via_resolver(corpus, raw),
        "redirection" => resolve_redir(corpus, raw),
        "history_expn" => resolve_history(corpus, raw),
        "subscript_flag" | "param_expn_flag" | "glob_flag" | "glob_qualifier" => {
            resolve_parens_agnostic_flag(corpus, cat_name, raw)
        }
        "job_spec" => resolve_job_spec(corpus, raw),
        "special_function" => resolve_special_function(corpus, raw),
        "special_param" => resolve_special_param(corpus, raw),
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

/// Special-parameter resolver. Direct lookup happens in `resolve_in`; this
/// path handles the close-variant case `IDENT[inner]` → `IDENT` (e.g.
/// `compstate[context]` → `compstate`, `words[CURRENT]` → `words`).
/// Stripping is lossy; the inner-subscript text surfaces as
/// `ResolverFeedback::Subscripted`.
fn resolve_special_param<'c>(corpus: &'c Corpus, raw: &str) -> Option<ResolvedHit<'c>> {
    let t = raw.trim();
    let open = t.find('[')?;
    if !t.ends_with(']') || open == 0 || open + 1 >= t.len() - 1 {
        return None;
    }
    let ident = &t[..open];
    let inner = &t[open + 1..t.len() - 1];
    if inner.is_empty() {
        return None;
    }
    let bytes = ident.as_bytes();
    let first_ok = matches!(bytes[0], b'A'..=b'Z' | b'a'..=b'z' | b'_');
    if !first_ok {
        return None;
    }
    if !bytes[1..]
        .iter()
        .all(|b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_'))
    {
        return None;
    }
    find_by_id(
        corpus,
        "special_param",
        ident,
        Some(ResolverFeedback::Subscripted(inner.to_string())),
    )
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
    find_by_id(corpus, "history_expn", key, None)
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
    if let Some(h) = try_flag_key(corpus, cat_name, t) {
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
    try_flag_key(corpus, cat_name, stripped)
}

/// Try a key against the flag map. For categories whose sigs carry argument
/// placeholders (`param_expn_flag`, `subscript_flag`), accepts the full sig
/// form (`j:string:`) by stripping args down to the bare flag letter (`j`).
fn try_flag_key<'c>(corpus: &'c Corpus, cat_name: &str, key: &str) -> Option<ResolvedHit<'c>> {
    if let Some(h) = find_by_id(corpus, cat_name, key, None) {
        return Some(h);
    }
    if matches!(cat_name, "param_expn_flag" | "subscript_flag") && key.contains(':') {
        let bare = key.split(':').next().unwrap_or("");
        if !bare.is_empty() {
            return find_by_id(corpus, cat_name, bare, None);
        }
    }
    None
}

fn resolve_redir<'c>(corpus: &'c Corpus, raw: &str) -> Option<ResolvedHit<'c>> {
    let cat = corpus.category("redirection")?;
    // Sig-form close-variant: the documented sig (e.g. `> word`) maps to its
    // shell-safe slug (`>_word`) by replacing whitespace with `_`.
    let sig_slug: String = raw.split_whitespace().collect::<Vec<_>>().join("_");
    if !sig_slug.is_empty() {
        if let Some(h) = find_by_id(corpus, "redirection", &sig_slug, None) {
            return Some(h);
        }
    }
    let text = raw.trim().trim_start_matches(|c: char| c.is_ascii_digit());
    if text.is_empty() {
        return None;
    }
    if text == "<<" || text == "<<-" {
        return None;
    }
    if let Some(delim) = text.strip_prefix("<<-") {
        if !delim.is_empty() {
            return find_by_id(corpus, "redirection", "<<[-]_word", None);
        }
    } else if text.starts_with("<<") && !text.starts_with("<<<") {
        let delim = &text[2..];
        if !delim.is_empty() {
            return find_by_id(corpus, "redirection", "<<[-]_word", None);
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
            let (_, _, rec) = entries[0];
            Some(make_hit(cat, rec, None, None))
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
