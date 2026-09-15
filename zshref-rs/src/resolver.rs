//! Per-category resolver dispatch and lossy-resolution feedback.
//! See DESIGN.md §"Resolver feedback channel".
//
// MIRROR-OF: packages/zsh-core/src/docs/resolver.ts
// MIRROR-OF: packages/zsh-core/src/docs/normalize-option.ts

use crate::corpus::{Category, Corpus, DocCategory, Record};
use serde::Serialize;
use serde_json::{Map, Value, json};

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

/// Lossy-resolution feedback from a per-category resolver: an option name
/// reached via `NO_`-stripping, or a special-parameter name reached by
/// dropping a trailing `[subscript]` (`compstate[context]` → `compstate`).
/// Serializes as the kind-tagged object the tools emit; the `kind` values
/// are the TS union's literals, pinned by the fixture.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ResolverFeedback {
    InputNegated,
    Subscripted { subscript: String },
}

impl ResolverFeedback {
    /// One closed JSON Schema per kind, variant order — the `oneOf` behind
    /// the tool output schemas' `Feedback`. Adding a kind: a variant, a row here.
    pub fn kind_schemas() -> Vec<Value> {
        let kind_schema = |kind: &str, extra: &[(&str, Value)]| {
            let required: Vec<&str> = std::iter::once("kind")
                .chain(extra.iter().map(|(k, _)| *k))
                .collect();
            let mut properties = Map::new();
            properties.insert("kind".into(), json!({ "const": kind }));
            for (k, v) in extra {
                properties.insert((*k).into(), v.clone());
            }
            json!({
                "type": "object",
                "additionalProperties": false,
                "required": required,
                "properties": properties,
            })
        };
        vec![
            kind_schema("input-negated", &[]),
            kind_schema(
                "subscripted",
                &[("subscript", json!({ "type": "string", "minLength": 1 }))],
            ),
        ]
    }
}

/// Resolved corpus hit from "direct ∥ resolver, direct preferred" dispatch.
/// Carries enough for both docs' `{mdBody, feedback?}` and search's dedup-key + entry.
#[derive(Clone, Debug)]
pub struct ResolvedHit<'c> {
    pub category: DocCategory,
    pub id: &'c str,
    pub display: &'c str,
    pub rec: &'c Record,
    /// `None` for loss-free paths or non-emitting categories.
    pub feedback: Option<ResolverFeedback>,
}

/// Per-category resolver dispatch. See DESIGN.md §"docs: direct ∥ resolver"
/// and `lookupRaw` in zsh-core.
pub fn resolve_in<'c>(corpus: &'c Corpus, cat: DocCategory, raw: &str) -> Option<ResolvedHit<'c>> {
    if let Some(h) = direct_lookup(corpus, cat, raw) {
        return Some(h);
    }
    match cat.as_str() {
        "option" => resolve_option_via_resolver(corpus, cat, raw),
        "redirection" => resolve_redir(corpus, cat, raw),
        "history_expn" => resolve_history(corpus, cat, raw),
        "subscript_flag" | "param_expn_flag" | "glob_flag" | "glob_qualifier" => {
            resolve_parens_agnostic_flag(corpus, cat, raw)
        }
        "job_spec" => resolve_job_spec(corpus, cat, raw),
        "special_function" => resolve_special_function(corpus, cat, raw),
        "special_param" => resolve_special_param(corpus, cat, raw),
        _ => resolve_literal(corpus, cat, raw),
    }
}

fn make_hit<'c>(
    cat: &'c Category,
    rec: &'c Record,
    feedback: Option<ResolverFeedback>,
) -> ResolvedHit<'c> {
    ResolvedHit {
        category: cat.name,
        id: rec.id(),
        display: rec.display(),
        rec,
        feedback,
    }
}

fn find_by<'c>(
    corpus: &'c Corpus,
    cat: DocCategory,
    pred: impl Fn(&Record) -> bool,
    feedback: Option<ResolverFeedback>,
) -> Option<ResolvedHit<'c>> {
    let cat = corpus.category(cat);
    let rec = cat.records.iter().find(|r| pred(r))?;
    Some(make_hit(cat, rec, feedback))
}

fn find_by_id<'c>(
    corpus: &'c Corpus,
    cat: DocCategory,
    id: &str,
    feedback: Option<ResolverFeedback>,
) -> Option<ResolvedHit<'c>> {
    find_by(corpus, cat, |r| r.id() == id, feedback)
}

fn direct_lookup<'c>(corpus: &'c Corpus, cat: DocCategory, raw: &str) -> Option<ResolvedHit<'c>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    find_by_id(corpus, cat, trimmed, None)
}

fn resolve_job_spec<'c>(
    corpus: &'c Corpus,
    cat: DocCategory,
    raw: &str,
) -> Option<ResolvedHit<'c>> {
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
    find_by_id(corpus, cat, key, None)
}

/// Special-parameter resolver. Direct lookup happens in `resolve_in`; this
/// path strips the `$`/`${…}` sigil (the only way the punctuation params
/// `$#`, `$?`, … arrive) and handles the close-variant `IDENT[inner]`
/// subscript (see [`resolve_param_subscript`]).
fn resolve_special_param<'c>(
    corpus: &'c Corpus,
    cat: DocCategory,
    raw: &str,
) -> Option<ResolvedHit<'c>> {
    let t = raw.trim();
    if let Some(name) = t.strip_prefix('$') {
        let name = name
            .strip_prefix('{')
            .and_then(|r| r.strip_suffix('}'))
            .unwrap_or(name);
        if !name.is_empty() {
            return find_by_id(corpus, cat, name, None)
                .or_else(|| resolve_param_subscript(corpus, cat, name));
        }
    }
    resolve_param_subscript(corpus, cat, t)
}

/// Close-variant `IDENT[inner]` → `IDENT` (e.g. `compstate[context]` →
/// `compstate`, `words[CURRENT]` → `words`). Stripping is lossy; the
/// inner-subscript text surfaces as `ResolverFeedback::Subscripted`.
fn resolve_param_subscript<'c>(
    corpus: &'c Corpus,
    cat: DocCategory,
    raw: &str,
) -> Option<ResolvedHit<'c>> {
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
        cat,
        ident,
        Some(ResolverFeedback::Subscripted {
            subscript: inner.to_string(),
        }),
    )
}

fn resolve_special_function<'c>(
    corpus: &'c Corpus,
    cat: DocCategory,
    raw: &str,
) -> Option<ResolvedHit<'c>> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    if let Some(stripped) = t.strip_suffix("_functions")
        && crate::corpus::HOOK_NAMES.contains(&stripped)
        && let Some(h) = find_by_id(corpus, cat, stripped, None)
    {
        return Some(h);
    }
    if t.starts_with("TRAP")
        && t.len() > 4
        && t[4..]
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return find_by_id(corpus, cat, "TRAPNAL", None);
    }
    None
}

fn resolve_literal<'c>(corpus: &'c Corpus, cat: DocCategory, raw: &str) -> Option<ResolvedHit<'c>> {
    let trimmed = raw.trim();
    find_by(
        corpus,
        cat,
        |r| r.id() == trimmed || r.display() == trimmed,
        None,
    )
}

fn resolve_option_via_resolver<'c>(
    corpus: &'c Corpus,
    cat: DocCategory,
    raw: &str,
) -> Option<ResolvedHit<'c>> {
    let norm = normalize_option(raw);
    find_by_id(corpus, cat, &norm, None).or_else(|| {
        let stripped = strip_no_prefix(raw)?;
        let norm2 = normalize_option(&stripped);
        find_by_id(corpus, cat, &norm2, Some(ResolverFeedback::InputNegated))
    })
}

fn resolve_history<'c>(corpus: &'c Corpus, cat: DocCategory, raw: &str) -> Option<ResolvedHit<'c>> {
    let key = history_key(raw.trim())?;
    find_by_id(corpus, cat, key, None)
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
    cat: DocCategory,
    raw: &str,
) -> Option<ResolvedHit<'c>> {
    let t = raw.trim();
    if let Some(h) = try_flag_key(corpus, cat, t) {
        return Some(h);
    }
    if !(t.starts_with('(') && t.ends_with(')') && t.len() >= 2) {
        return None;
    }

    let inner = &t[1..t.len() - 1];
    let stripped = match cat.as_str() {
        "glob_flag" => inner.strip_prefix('#').unwrap_or(inner),
        "glob_qualifier" => inner.strip_prefix("#q").unwrap_or(inner),
        _ => inner,
    };
    if stripped.is_empty() {
        return None;
    }
    try_flag_key(corpus, cat, stripped)
}

/// Try a key against the flag map. For categories whose sigs carry argument
/// placeholders (`param_expn_flag`, `subscript_flag`), accepts the full sig
/// form (`j:string:`) by stripping args down to the bare flag letter (`j`).
fn try_flag_key<'c>(corpus: &'c Corpus, cat: DocCategory, key: &str) -> Option<ResolvedHit<'c>> {
    if let Some(h) = find_by_id(corpus, cat, key, None) {
        return Some(h);
    }
    if matches!(cat.as_str(), "param_expn_flag" | "subscript_flag") && key.contains(':') {
        let bare = key.split(':').next().unwrap_or("");
        if !bare.is_empty() {
            return find_by_id(corpus, cat, bare, None);
        }
    }
    None
}

fn resolve_redir<'c>(corpus: &'c Corpus, cat: DocCategory, raw: &str) -> Option<ResolvedHit<'c>> {
    // Sig-form close-variant: `> word` → its shell-safe slug `>_word`.
    let sig_slug: String = raw.split_whitespace().collect::<Vec<_>>().join("_");
    if !sig_slug.is_empty()
        && let Some(h) = find_by_id(corpus, cat, &sig_slug, None)
    {
        return Some(h);
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
            return find_by_id(corpus, cat, "<<[-]_word", None);
        }
    } else if text.starts_with("<<") && !text.starts_with("<<<") {
        let delim = &text[2..];
        if !delim.is_empty() {
            return find_by_id(corpus, cat, "<<[-]_word", None);
        }
    }

    let redirs = corpus.category(cat);
    let docs: Vec<(&str, &str, &Record)> = redirs
        .records
        .iter()
        .map(|r| (r.str("sig"), r.str("groupOp"), r))
        .collect();

    let group_op = docs
        .iter()
        .filter(|(_, g, _)| text.starts_with(*g))
        .map(|(_, g, _)| *g)
        .max_by_key(|g| g.len())?;

    let matched: Vec<_> = docs.iter().filter(|(_, g, _)| *g == group_op).collect();
    fn unique_hit<'c>(
        cat: &'c Category,
        entries: &[&(&str, &str, &'c Record)],
    ) -> Option<ResolvedHit<'c>> {
        if entries.len() == 1 {
            let (_, _, rec) = entries[0];
            Some(make_hit(cat, rec, None))
        } else {
            None
        }
    }
    if let Some(v) = unique_hit(redirs, &matched) {
        return Some(v);
    }

    let want_kind = tail_kind_of(text[group_op.len()..].trim_start());
    let narrowed: Vec<_> = matched
        .iter()
        .copied()
        .filter(|(sig, go, _)| sig[go.len()..].trim_start() == want_kind)
        .collect();
    unique_hit(redirs, &narrowed)
}

fn tail_kind_of(tail: &str) -> &str {
    match tail {
        "" => "",
        "-" | "p" => tail,
        t if t.chars().all(|c| c.is_ascii_digit()) => "number",
        _ => "word",
    }
}

#[cfg(test)]
mod tests {
    //! Behavioural conformance to zsh-core's resolver fixture: the answers the
    //! TS resolvers give for pinned and generated inputs, released with the
    //! corpus.
    use super::*;
    use crate::corpus::{DOC_CATEGORIES, load_corpus, resolver_fixture_path};
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Fixture {
        version: u32,
        #[serde(rename = "packageVersion")]
        package_version: String,
        #[serde(rename = "dataHash")]
        data_hash: String,
        cases: serde_json::Map<String, Value>,
    }

    #[derive(Deserialize)]
    struct Case {
        input: String,
        id: Option<String>,
        feedback: Option<Value>,
    }

    #[test]
    fn resolver_conforms_to_fixture() {
        let corpus = load_corpus().expect("load_corpus");
        let path = resolver_fixture_path();
        let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
            panic!(
                "{}: {e}\nthe fixture is refreshed together with the corpus: \
                 `make cli-test` (monorepo) or `make cli-vendored-test` (vendored)",
                path.display()
            )
        });
        let fixture: Fixture = serde_json::from_str(&text).expect("fixture parses");

        assert_eq!(fixture.version, 1);
        let same_build = "fixture and embedded index.json come from different zsh-core builds \
                          — rebuild through the make target, not plain `cargo test`";
        assert_eq!(
            fixture.package_version, corpus.index.package_version,
            "{same_build}"
        );
        assert_eq!(fixture.data_hash, corpus.index.data_hash, "{same_build}");
        let fixture_cats: Vec<&str> = fixture.cases.keys().map(String::as_str).collect();
        let doc_cats: Vec<&str> = DOC_CATEGORIES.iter().map(|c| c.as_str()).collect();
        assert_eq!(fixture_cats, doc_cats);

        let mut mismatches: Vec<String> = Vec::new();
        for (cat, cases) in &fixture.cases {
            let cases: Vec<Case> = serde_json::from_value(cases.clone()).expect("cases parse");
            assert!(!cases.is_empty(), "{cat}: no cases");
            let category: DocCategory = cat.parse().expect("fixture category is documented");
            for case in cases {
                let hit = resolve_in(&corpus, category, &case.input);
                let got = (
                    hit.as_ref().map(|h| h.id.to_string()),
                    hit.as_ref()
                        .and_then(|h| h.feedback.as_ref().map(|fb| json!(fb))),
                );
                let want = (case.id, case.feedback);
                if got != want {
                    mismatches.push(format!(
                        "{cat} / {:?}: expected {want:?}, got {got:?}",
                        case.input
                    ));
                }
            }
        }
        assert!(
            mismatches.is_empty(),
            "resolver.rs disagrees with the fixture:\n  {}",
            mismatches.join("\n  ")
        );
    }

    #[test]
    fn every_feedback_kind_validates_against_its_schema() {
        let samples = [
            ResolverFeedback::InputNegated,
            ResolverFeedback::Subscripted {
                subscript: "context".into(),
            },
        ];
        let schemas = ResolverFeedback::kind_schemas();
        assert_eq!(samples.len(), schemas.len());
        for (fb, schema) in samples.iter().zip(&schemas) {
            let validator = jsonschema::draft202012::options()
                .build(schema)
                .expect("kind schema compiles");
            let v = json!(fb);
            assert!(validator.is_valid(&v), "{v} fails {schema}");
        }
    }
}
