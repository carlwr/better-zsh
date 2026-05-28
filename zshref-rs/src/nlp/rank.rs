// WEB-MIRRORED-IN: zshref-web/src/lib/ranker/rank.ts
//
// Pure ranker math — all rank-time (no embedder / corpus dependency).
// Inputs are pre-computed (query string, query vector, optional resolver
// hit) so the TS mirror in zshref-web can re-implement it 1:1.

use crate::nlp::index::{IndexedRecord, VectorIndex};
use crate::nlp::retrieval_text::RecordText;
use crate::nlp::rules::{stopwords, BoostWeights, SemanticWeights, Tuning};
use serde::Serialize;
use std::collections::HashMap;

/// Resolver-resolved (category, id) pair from outside the ranker.
pub type ResolverHit = (String, String);

#[derive(Debug, Serialize)]
pub struct RankedMatch<'a> {
    pub rec: &'a RecordText,
    pub score: f32,
    pub debug: RankDebug,
}

#[derive(Clone, Debug, Serialize)]
pub struct RankDebug {
    pub semantic: SemanticScores,
    pub boosts: Boosts,
}

#[derive(Clone, Debug, Serialize)]
pub struct SemanticScores {
    pub structured: f32,
    pub body: f32,
    pub expanded: f32,
}

#[derive(Clone, Debug, Serialize)]
pub struct Boosts {
    pub category: f32,
    pub resolver: f32,
    pub lexical: f32,
}

pub fn rank<'a>(
    query: &str,
    query_vec: &[f32],
    resolver_hit: Option<&ResolverHit>,
    category: Option<&str>,
    index: &'a VectorIndex,
    tuning: &Tuning,
) -> Vec<RankedMatch<'a>> {
    let q = query.to_ascii_lowercase();
    let penalties = category_penalties(index, tuning);

    let mut out: Vec<RankedMatch<'a>> = index
        .records
        .iter()
        .filter(|rec| category.is_none_or(|cat| rec.text.category == cat))
        .map(|rec| {
            let penalty = penalties
                .get(rec.text.category.as_str())
                .copied()
                .unwrap_or(0.0);
            score_record(rec, query_vec, &q, resolver_hit, penalty, tuning)
        })
        .collect();
    out.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.rec.category.cmp(&b.rec.category))
            .then_with(|| a.rec.id.cmp(&b.rec.id))
    });
    out
}

fn score_record<'a>(
    rec: &'a IndexedRecord,
    query_vec: &[f32],
    q: &str,
    resolver_hit: Option<&ResolverHit>,
    category_penalty: f32,
    tuning: &Tuning,
) -> RankedMatch<'a> {
    let semantic = SemanticScores {
        structured: dot(query_vec, &rec.vectors.structured),
        body: dot(query_vec, &rec.vectors.body),
        expanded: dot(query_vec, &rec.vectors.expanded),
    };
    let boosts = boosts(&rec.text, q, resolver_hit, tuning);

    let body_words = rec.text.body.split_whitespace().count();
    let (body_w, struct_w, exp_w) = semantic_weights(body_words, &tuning.semantic_weights);
    let semantic_score =
        body_w * semantic.body + struct_w * semantic.structured + exp_w * semantic.expanded;

    RankedMatch {
        rec: &rec.text,
        score: semantic_score + boosts.category + boosts.resolver + boosts.lexical
            - category_penalty,
        debug: RankDebug { semantic, boosts },
    }
}

/// Effective (body, structured, expanded) weights. `expanded` is derived as
/// `1 − body − structured` (on the simplex by construction), then mass is
/// shifted body → expanded the shorter the body. Continuous — no threshold cliff.
fn semantic_weights(body_words: usize, sw: &SemanticWeights) -> (f32, f32, f32) {
    let body = sw.body;
    let structured = sw.structured;
    let expanded = 1.0 - body - structured;
    let ramp = (1.0 - body_words as f32 / sw.short_body.length_scale).max(0.0);
    let shift = (sw.short_body.strength * ramp).clamp(0.0, body);
    (body - shift, structured, expanded + shift)
}

/// Data-derived unusualness penalty: smaller categories need slightly higher
/// semantic score to outrank broad categories.
fn category_penalty(record_count: usize, max_records: usize, tuning: &Tuning) -> f32 {
    if max_records <= 1 {
        return 0.0;
    }
    let rarity = 1.0 - (record_count.max(1) as f32).ln() / (max_records as f32).ln();
    tuning.penalties.category_rarity_max * rarity.clamp(0.0, 1.0)
}

fn category_penalties<'a>(index: &'a VectorIndex, tuning: &Tuning) -> HashMap<&'a str, f32> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for rec in &index.records {
        *counts.entry(rec.text.category.as_str()).or_insert(0) += 1;
    }
    let max_records = counts.values().copied().max().unwrap_or(0);
    counts
        .into_iter()
        .map(|(cat, count)| (cat, category_penalty(count, max_records, tuning)))
        .collect()
}

fn boosts(
    rec: &RecordText,
    q: &str,
    resolver_hit: Option<&ResolverHit>,
    tuning: &Tuning,
) -> Boosts {
    let b = &tuning.boosts;
    let category = if q.contains(&rec.category.to_ascii_lowercase())
        || q.contains(&rec.category_label.to_ascii_lowercase())
    {
        b.category
    } else {
        0.0
    };
    let resolver = resolver_hit
        .filter(|(cat, id)| cat == &rec.category && id == &rec.id)
        .map(|_| b.resolver())
        .unwrap_or(0.0);
    let id = rec.id.to_ascii_lowercase();
    let display = rec.display.to_ascii_lowercase();
    let word_exact = significant_words(q, tuning)
        .into_iter()
        .filter(|word| is_discriminating_word(word, tuning))
        .any(|word| {
            let w = word.to_ascii_lowercase();
            w == id || w == display
        });
    // Symbolic surface match: zsh users name operators and special parameters by
    // their literal symbol ("$?", ">>", "<<<"), which is punctuation, so
    // significant_words drops it. Match those tokens against the record's id and
    // the symbolic head of its display — the punctuation analogue of word_exact.
    let symbol_exact = symbol_tokens(q)
        .iter()
        .any(|t| *t == id || symbol_head(&display).is_some_and(|h| h == t));
    let exact_word = if word_exact || symbol_exact {
        b.exact_word()
    } else {
        0.0
    };
    let lexical = exact_word + overlap_boost(word_overlap(rec, q, tuning), b);

    Boosts {
        category,
        resolver,
        lexical,
    }
}

/// Smooth saturating lexical-overlap boost over the overlap count `n`:
/// `scale · n / (n + half_sat)` — monotone, asymptote `scale`, half at `half_sat`.
fn overlap_boost(n: usize, b: &BoostWeights) -> f32 {
    let n = n as f32;
    let wo = &b.word_overlap;
    wo.scale * n / (n + wo.half_sat)
}

fn is_discriminating_word(word: &str, tuning: &Tuning) -> bool {
    if word.len() < tuning.lexical.min_discriminating_word_len {
        return false;
    }
    let sw = stopwords();
    let lower = word.to_ascii_lowercase();
    !sw.generic.iter().any(|s| s == &lower) && !sw.discriminating_extra.iter().any(|s| s == &lower)
}

fn word_overlap(rec: &RecordText, q: &str, tuning: &Tuning) -> usize {
    let rec_text = format!(
        "{} {} {} {} {}",
        rec.id, rec.display, rec.structured, rec.body, rec.expanded
    )
    .to_ascii_lowercase();
    significant_words(q, tuning)
        .into_iter()
        .filter(|word| rec_text.contains(word))
        .count()
}

fn significant_words<'a>(s: &'a str, tuning: &Tuning) -> Vec<&'a str> {
    let sw = stopwords();
    let min = tuning.lexical.min_significant_word_len;
    s.split(|c: char| !c.is_ascii_alphanumeric())
        .filter(move |word| word.len() >= min)
        .filter(|word| !sw.generic.iter().any(|stop| stop == *word))
        .collect()
}

/// Literal symbol tokens in `q`: whitespace tokens that bear punctuation or are
/// `$`-sigiled parameter refs, lowercased, with surrounding quotes and one
/// leading `$` stripped ("$?" -> "?"). These are exactly what `significant_words`
/// discards, yet they are how zsh names its operators and special parameters.
fn symbol_tokens(q: &str) -> Vec<String> {
    q.split_whitespace()
        .filter(|t| t.starts_with('$') || t.chars().any(|c| !c.is_ascii_alphanumeric()))
        .map(|t| t.trim_matches(|c| matches!(c, '\'' | '"' | '`')))
        .map(|t| t.strip_prefix('$').unwrap_or(t).to_ascii_lowercase())
        .filter(|t| !t.is_empty())
        .collect()
}

/// Leading run of operator characters in a display form — the symbol before any
/// alphanumeric operand placeholder: ">> word" -> Some(">>"), "?" -> Some("?"),
/// "auto_cd" -> None. Lets a bare-operator query match a sig-shaped record.
fn symbol_head(display: &str) -> Option<&str> {
    let end = display
        .find(|c: char| c.is_ascii_alphanumeric() || c == ' ')
        .unwrap_or(display.len());
    (end > 0).then_some(&display[..end])
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nlp::rules::tuning;

    #[test]
    fn exact_id_match_gives_lexical_boost() {
        let rec = RecordText {
            category: "option".into(),
            category_label: "option".into(),
            id: "autocd".into(),
            display: "AUTO_CD".into(),
            sub_kind: None,
            title: String::new(),
            md_body: String::new(),
            structured: String::new(),
            body: String::new(),
            expanded: String::new(),
        };
        let exact = boosts(&rec, "autocd", None, tuning());
        let query_with_category = boosts(&rec, "option autocd please", None, tuning());
        // Both queries contain the discriminating word "autocd" and get the
        // exact-word boost, so lexical scores can be equal.
        assert!(exact.lexical > 0.0);
        assert!(query_with_category.category > 0.0);
    }

    #[test]
    fn symbol_tokens_strip_sigil_and_keep_operators() {
        assert_eq!(symbol_tokens("the $? param"), vec!["?"]);
        assert_eq!(symbol_tokens("redirection >>"), vec![">>"]);
        assert_eq!(symbol_tokens("$0"), vec!["0"]); // sigiled even if alnum after strip
        assert!(symbol_tokens("list all background jobs").is_empty());
    }

    #[test]
    fn symbol_head_is_the_operator_prefix() {
        assert_eq!(symbol_head(">> word"), Some(">>"));
        assert_eq!(symbol_head("?"), Some("?"));
        assert_eq!(symbol_head("auto_cd"), None); // leading alnum -> no symbol head
    }

    #[test]
    fn symbol_query_matches_param_and_operator_records() {
        let param = RecordText {
            category: "special_param".into(),
            category_label: "special parameter".into(),
            id: "?".into(),
            display: "?".into(),
            sub_kind: None,
            title: String::new(),
            md_body: String::new(),
            structured: String::new(),
            body: String::new(),
            expanded: String::new(),
        };
        let redir = RecordText {
            category: "redirection".into(),
            id: ">>_word".into(),
            display: ">> word".into(),
            ..param.clone()
        };
        // "$?" names the `?` param; ">>" names `>>_word` via its display's
        // symbolic head — both fire the lexical boost. A prose word does not.
        assert!(boosts(&param, "the $? param", None, tuning()).lexical > 0.0);
        assert!(boosts(&redir, "redirection >>", None, tuning()).lexical > 0.0);
        assert_eq!(
            boosts(&param, "list background jobs", None, tuning()).lexical,
            0.0
        );
    }

    use crate::nlp::rules::ShortBodyDeform;

    fn sw(body: f32, structured: f32, strength: f32) -> SemanticWeights {
        SemanticWeights {
            body,
            structured,
            short_body: ShortBodyDeform {
                strength,
                length_scale: 10.0,
            },
        }
    }

    #[test]
    fn semantic_weights_derive_expanded() {
        // expanded = 1 − body − structured; the triple sums to 1 by construction.
        let (b, s, e) = semantic_weights(1000, &sw(0.70, 0.20, 0.0));
        assert!((b - 0.70).abs() < 1e-6);
        assert!((s - 0.20).abs() < 1e-6);
        assert!((e - 0.10).abs() < 1e-6);
        assert!((b + s + e - 1.0).abs() < 1e-6);
    }

    #[test]
    fn short_body_shift_is_continuous_with_exact_endpoints() {
        let w = sw(0.70, 0.20, 0.10);
        // L ≥ length_scale: base mix, no shift.
        assert!((semantic_weights(10, &w).0 - 0.70).abs() < 1e-6);
        // L = 0: full strength shift body → expanded (the old short-body triple).
        let z = semantic_weights(0, &w);
        assert!((z.0 - 0.60).abs() < 1e-6);
        assert!((z.1 - 0.20).abs() < 1e-6);
        assert!((z.2 - 0.20).abs() < 1e-6);
        // Strictly monotone across the ramp — no discontinuity.
        let a = semantic_weights(2, &w).0;
        let b = semantic_weights(7, &w).0;
        assert!(0.60 < a && a < b && b < 0.70);
    }

    #[test]
    fn boosts_are_reliability_ordered() {
        let b = &tuning().boosts;
        assert!(b.category <= b.exact_word());
        assert!(b.exact_word() <= b.resolver());
    }

    #[test]
    fn overlap_boost_saturates_monotonically() {
        let b = &tuning().boosts;
        assert_eq!(overlap_boost(0, b), 0.0);
        let one = overlap_boost(1, b);
        let many = overlap_boost(100, b);
        assert!(one > 0.0 && one < many);
        // Smooth saturation never reaches the asymptote.
        assert!(many < b.word_overlap.scale);
    }

    #[test]
    fn prose_overlap_beats_broad_name_containment() {
        let aliases = RecordText {
            category: "option".into(),
            category_label: "option".into(),
            id: "aliases".into(),
            display: "ALIASES".into(),
            sub_kind: None,
            title: String::new(),
            md_body: String::new(),
            structured: "id: aliases".into(),
            body: "Expand aliases.".into(),
            expanded: String::new(),
        };
        let complete = RecordText {
            id: "completealiases".into(),
            display: "COMPLETE_ALIASES".into(),
            body: "Prevents aliases before completion is attempted.".into(),
            structured: "id: completealiases".into(),
            expanded: String::new(),
            ..aliases.clone()
        };
        // Query has more discriminating words in complete's body/structured
        // than in aliases's — overlap should favour complete.
        let q = "prevents expansion before completion";
        assert!(
            boosts(&complete, q, None, tuning()).lexical
                > boosts(&aliases, q, None, tuning()).lexical
        );
    }
}
