//! Typed loaders for embedded NLP rule data.
//!
//! Parse-time invariants live here so callers only see validated rules.

use anyhow::{anyhow, Context, Result};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

const SYNONYMS_YAML: &str = include_str!("rules/synonyms.yaml");
const STOPWORDS_YAML: &str = include_str!("rules/stopwords.yaml");
const TUNING_YAML: &str = include_str!("rules/tuning.yaml");

/// Generic zsh/English synonym data. Two disjoint mechanisms — see
/// `synonyms.yaml` for the contract. Authored blind to the eval sets (see
/// `NLP.md`).
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Synonyms {
    /// Symmetric, index-time. If any member matches a record (whole word /
    /// phrase), the others are appended to its `expanded` view before
    /// embedding (see `retrieval_text.rs`). May be empty.
    #[serde(default)]
    pub index_groups: Vec<Vec<String>>,
    /// Directional, query-time, embedding-only. Maps colloquial query
    /// vocabulary onto the corpus's canonical term (see `query_expand.rs`).
    #[serde(default)]
    pub query_expansions: Vec<QueryExpansion>,
}

/// One directional query rule: when any `when` trigger matches the query, the
/// single canonical `add` term is appended to the *embedded* query string only
/// (never the lexical-overlap bag — keeps short queries from being swamped).
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct QueryExpansion {
    /// Colloquial trigger words / phrases (matched whole word / phrase). Any
    /// casing; normalized to lowercase at load.
    pub when: Vec<String>,
    /// Canonical term appended for embedding. One term by design; any casing,
    /// normalized to lowercase at load.
    pub add: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Stopwords {
    pub generic: Vec<String>,
    pub discriminating_extra: Vec<String>,
}

/// Rank-time scalar constants for the ranker (no re-embed on change).
/// Serialized downstream for non-Rust rankers.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Tuning {
    pub semantic_weights: SemanticWeights,
    pub boosts: BoostWeights,
    pub penalties: PenaltyWeights,
    pub lexical: LexicalThresholds,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SemanticWeights {
    /// Mix over the embedding views. Only these two are stored; `expanded` is
    /// derived as `1 − body − structured` (on the simplex by construction).
    /// See `rank::semantic_weights`.
    pub body: f32,
    pub structured: f32,
    pub short_body: ShortBodyDeform,
}

/// Sparse-body deformation: shifts mass body → expanded as a body shortens, so
/// short records lean on structured/expanded text. See `rank::semantic_weights`.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ShortBodyDeform {
    /// Max shift, at body length 0.
    pub strength: f32,
    /// Body length at/above which the shift is zero.
    pub length_scale: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct BoostWeights {
    /// Weakest signal: query names the record's category.
    pub category: f32,
    /// Non-negative increment for a query word equal to id/display
    /// (`exact_word = category + this`).
    pub exact_word_increment: f32,
    /// Non-negative increment for a corpus-aware resolver hit
    /// (`resolver = exact_word + this`); the increments keep
    /// `category ≤ exact_word ≤ resolver` by construction.
    pub resolver_increment: f32,
    pub word_overlap: WordOverlap,
}

/// Smooth saturating overlap boost; see `rank::overlap_boost`.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct WordOverlap {
    pub scale: f32,
    pub half_sat: f32,
}

impl BoostWeights {
    /// Effective exact-word boost.
    pub fn exact_word(&self) -> f32 {
        self.category + self.exact_word_increment
    }

    /// Effective resolver boost (the strongest, by construction).
    pub fn resolver(&self) -> f32 {
        self.exact_word() + self.resolver_increment
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PenaltyWeights {
    pub category_rarity_max: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LexicalThresholds {
    pub min_discriminating_word_len: usize,
    pub min_significant_word_len: usize,
}

pub fn synonyms() -> &'static Synonyms {
    static CACHE: OnceLock<Synonyms> = OnceLock::new();
    CACHE.get_or_init(|| {
        parse_synonyms(SYNONYMS_YAML).expect("synonyms.yaml must parse and validate")
    })
}

pub fn stopwords() -> &'static Stopwords {
    static CACHE: OnceLock<Stopwords> = OnceLock::new();
    CACHE.get_or_init(|| {
        parse_stopwords(STOPWORDS_YAML).expect("stopwords.yaml must parse and validate")
    })
}

pub fn tuning() -> &'static Tuning {
    static CACHE: OnceLock<Tuning> = OnceLock::new();
    CACHE.get_or_init(|| parse_tuning(TUNING_YAML).expect("tuning.yaml must parse and validate"))
}

fn parse_synonyms(src: &str) -> Result<Synonyms> {
    let mut syn: Synonyms = serde_yaml_ng::from_str(src).context("parse synonyms.yaml")?;
    for (i, group) in syn.index_groups.iter_mut().enumerate() {
        if group.len() < 2 {
            return Err(anyhow!(
                "synonyms.yaml index_groups[{i}]: a group needs at least 2 members"
            ));
        }
        for m in group.iter_mut() {
            normalize_term(m, &format!("index_groups[{i}]"))?;
        }
    }
    for (i, exp) in syn.query_expansions.iter_mut().enumerate() {
        if exp.when.is_empty() {
            return Err(anyhow!(
                "synonyms.yaml query_expansions[{i}]: `when` needs at least 1 trigger"
            ));
        }
        for w in exp.when.iter_mut() {
            normalize_term(w, &format!("query_expansions[{i}].when"))?;
        }
        normalize_term(&mut exp.add, &format!("query_expansions[{i}].add"))?;
    }
    Ok(syn)
}

// Authors may write triggers / canonical terms in their natural casing (e.g.
// `PID`, `process ID`) or as multi-word phrases. The matchers compare against a
// lowercased haystack, so each term is trimmed and lowercased once here at load
// rather than constraining the author. Downstream JSON (`emit_rules_json`)
// serializes the normalized form, so the web mirror sees the same.
fn normalize_term(s: &mut String, ctx: &str) -> Result<()> {
    let normalized = s.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err(anyhow!("synonyms.yaml {ctx}: value must not be empty"));
    }
    *s = normalized;
    Ok(())
}

fn parse_stopwords(src: &str) -> Result<Stopwords> {
    let s: Stopwords = serde_yaml_ng::from_str(src).context("parse stopwords.yaml")?;
    Ok(s)
}

/// Ceiling on any single effective boost/penalty, in semantic-cosine units.
/// Half the cosine range: a heavier term would dominate the semantic signal.
const MAX_SCORE_TERM: f32 = 0.5;

fn parse_tuning(src: &str) -> Result<Tuning> {
    let t: Tuning = serde_yaml_ng::from_str(src).context("parse tuning.yaml")?;
    let sw = &t.semantic_weights;
    if sw.body < 0.0 || sw.structured < 0.0 {
        return Err(anyhow!(
            "tuning.yaml semantic_weights: body/structured must be non-negative"
        ));
    }
    if sw.body + sw.structured > 1.0 + 1e-4 {
        return Err(anyhow!(
            "tuning.yaml semantic_weights: body + structured must be ≤ 1 \
             (expanded is derived as 1 − body − structured)"
        ));
    }
    if sw.short_body.strength < 0.0 {
        return Err(anyhow!(
            "tuning.yaml semantic_weights.short_body.strength must be non-negative"
        ));
    }
    if sw.short_body.length_scale <= 0.0 {
        return Err(anyhow!(
            "tuning.yaml semantic_weights.short_body.length_scale must be positive"
        ));
    }
    let b = &t.boosts;
    if b.category < 0.0 || b.word_overlap.scale < 0.0 {
        return Err(anyhow!(
            "tuning.yaml boosts: category/word_overlap.scale must be non-negative"
        ));
    }
    if b.exact_word_increment < 0.0 || b.resolver_increment < 0.0 {
        return Err(anyhow!(
            "tuning.yaml boosts: exact_word_increment/resolver_increment must be non-negative \
             (preserves category ≤ exact_word ≤ resolver)"
        ));
    }
    if b.word_overlap.half_sat <= 0.0 {
        return Err(anyhow!(
            "tuning.yaml boosts.word_overlap.half_sat must be positive"
        ));
    }
    // Bound the *effective* terms (what lands on a record's score), not the
    // stored increments — so the chained exact_word/resolver values are checked.
    for (name, value) in [
        ("boosts.category", b.category),
        ("boosts effective exact_word", b.exact_word()),
        ("boosts effective resolver", b.resolver()),
        ("boosts.word_overlap.scale", b.word_overlap.scale),
        (
            "penalties.category_rarity_max",
            t.penalties.category_rarity_max,
        ),
    ] {
        if value > MAX_SCORE_TERM {
            return Err(anyhow!(
                "tuning.yaml {name}: {value} exceeds MAX_SCORE_TERM {MAX_SCORE_TERM} \
                 (a term that large would swamp the semantic signal)"
            ));
        }
    }
    Ok(t)
}

/// Emit downstream rule-data JSON into `dir`. `synonyms.json` carries the
/// query-time `query_expansions` the web mirror replays before its own query
/// embedding; `index_groups` are already baked into the shipped vectors.
pub fn emit_rules_json(dir: &Path) -> Result<()> {
    fs::create_dir_all(dir).with_context(|| format!("create {}", dir.display()))?;
    write_json(dir, "tuning.json", tuning())?;
    write_json(dir, "stopwords.json", stopwords())?;
    write_json(dir, "synonyms.json", synonyms())?;
    Ok(())
}

fn write_json<T: Serialize>(dir: &Path, name: &str, value: &T) -> Result<()> {
    let json = serde_json::to_string_pretty(value).expect("rule serializes") + "\n";
    let path = dir.join(name);
    fs::write(&path, json).with_context(|| format!("write {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nlp::test_support::assert_committed_json;
    use schemars::schema_for;
    use std::path::PathBuf;

    fn schema_path(filename: &str) -> PathBuf {
        [
            env!("CARGO_MANIFEST_DIR"),
            "src",
            "nlp",
            "rules",
            "schema",
            filename,
        ]
        .iter()
        .collect()
    }

    #[test]
    fn embedded_yaml_parses() {
        let _ = synonyms();
        let _ = stopwords();
        let _ = tuning();
    }

    #[test]
    fn index_group_with_single_member_is_rejected() {
        let src = "index_groups:\n  - [parameter]\n";
        assert!(parse_synonyms(src).is_err());
    }

    #[test]
    fn uppercase_and_phrase_terms_are_normalized_to_lowercase() {
        let src = "index_groups:\n  - [parameter, Variable]\n\
                   query_expansions:\n  - { when: [PID], add: 'process ID' }\n";
        let syn = parse_synonyms(src).expect("normalizes natural casing");
        assert_eq!(syn.index_groups[0], ["parameter", "variable"]);
        assert_eq!(syn.query_expansions[0].when, ["pid"]);
        assert_eq!(syn.query_expansions[0].add, "process id");
    }

    #[test]
    fn query_expansion_with_empty_when_is_rejected() {
        let src = "query_expansions:\n  - { when: [], add: option }\n";
        assert!(parse_synonyms(src).is_err());
    }

    #[test]
    fn query_expansion_with_blank_add_is_rejected() {
        let src = "query_expansions:\n  - { when: [setting], add: '  ' }\n";
        assert!(parse_synonyms(src).is_err());
    }

    #[test]
    fn both_lists_may_be_omitted() {
        assert!(parse_synonyms("{}\n").is_ok());
    }

    #[test]
    fn unknown_field_is_rejected() {
        let src = "index_groups: []\nextra: nope\n";
        assert!(parse_synonyms(src).is_err());
    }

    // `parse_tuning` validation: the committed file is the positive control
    // (`embedded_yaml_parses`); each case below mutates one token of it so the
    // structural priors it encodes (simplex sum, ordered boost chain, positive
    // saturation denominator) stay covered branch-by-branch.
    fn rejects_tuning(from: &str, to: &str) -> bool {
        let src = TUNING_YAML.replace(from, to);
        assert_ne!(src, TUNING_YAML, "replacement {from:?} matched nothing");
        parse_tuning(&src).is_err()
    }

    #[test]
    fn negative_semantic_weight_is_rejected() {
        assert!(rejects_tuning("body: 0.70", "body: -0.1"));
    }

    #[test]
    fn semantic_weights_summing_over_one_is_rejected() {
        assert!(rejects_tuning("structured: 0.20", "structured: 0.50"));
    }

    #[test]
    fn nonpositive_length_scale_is_rejected() {
        assert!(rejects_tuning("length_scale: 24", "length_scale: 0"));
    }

    #[test]
    fn negative_short_body_strength_is_rejected() {
        assert!(rejects_tuning("strength: 0.24", "strength: -0.1"));
    }

    #[test]
    fn negative_boost_increment_is_rejected() {
        assert!(rejects_tuning(
            "exact_word_increment: 0.06",
            "exact_word_increment: -0.1"
        ));
    }

    #[test]
    fn negative_base_boost_is_rejected() {
        assert!(rejects_tuning("category: 0.01", "category: -0.1"));
    }

    #[test]
    fn negative_overlap_scale_is_rejected() {
        assert!(rejects_tuning("scale: 0.30", "scale: -0.1"));
    }

    #[test]
    fn nonpositive_half_sat_is_rejected() {
        assert!(rejects_tuning("half_sat: 4.0", "half_sat: 0"));
    }

    #[test]
    fn boost_over_max_score_term_is_rejected() {
        assert!(rejects_tuning("category: 0.01", "category: 0.9"));
        assert!(rejects_tuning("scale: 0.30", "scale: 0.9"));
        assert!(rejects_tuning(
            "category_rarity_max: 0.0",
            "category_rarity_max: 0.9"
        ));
    }

    #[test]
    fn effective_resolver_over_max_score_term_is_rejected() {
        // The bound is on the effective term (category + increments), so a large
        // increment trips it even when each stored scalar looks small.
        assert!(rejects_tuning(
            "resolver_increment: 0.02",
            "resolver_increment: 0.9"
        ));
    }

    #[test]
    fn schemas_match_committed_files() {
        check_schema::<Synonyms>("synonyms.schema.json");
        check_schema::<Stopwords>("stopwords.schema.json");
        check_schema::<Tuning>("tuning.schema.json");
        check_schema::<crate::nlp::sentence_fixture::SentenceFixture>(
            "sentence-fixture.schema.json",
        );
    }

    fn check_schema<T: schemars::JsonSchema>(filename: &str) {
        let schema = schema_for!(T);
        let generated = serde_json::to_string_pretty(&schema).expect("schema serializes") + "\n";
        assert_committed_json(&schema_path(filename), &generated, "UPDATE_SCHEMAS");
    }

    #[test]
    fn emit_rules_json_round_trips() {
        let tmp = std::env::temp_dir().join(format!("zshref-emit-{}", std::process::id()));
        emit_rules_json(&tmp).expect("emit rules");
        let got: Tuning = serde_json::from_str(
            &fs::read_to_string(tmp.join("tuning.json")).expect("tuning emitted"),
        )
        .expect("tuning parses");
        assert_eq!(got.boosts.category, tuning().boosts.category);
        let _ = fs::remove_dir_all(&tmp);
    }
}
