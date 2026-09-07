// Sentence-style query fixture for natural-language search evaluation:
// hand-curated paraphrased questions, each targeting specific canonical
// records. Test-only — not loaded by the ranker at runtime.

use crate::nlp::lookup_map::{self, LookupIndex};
use crate::nlp::rank;
use crate::nlp::rules::Tuning;
use crate::nlp::search::{self, resolver_key};
use crate::nlp::{fixtures, fixtures::Assets};
use anyhow::Result;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SENTENCE_FIXTURE_VERSION: u32 = 4;

const SENTENCE_FIXTURE_YAML: &str = include_str!("rules/sentence-fixture.yaml");

/// Global sharpness of the per-entry rank discount (see [`g`]).
pub(crate) const BETA: f32 = 2.0;

/// Normalized rank discount: how topmost the expected record ranked, in
/// `(0, 1]`. `r` is the 1-based rank of the expected record in the full
/// ranking, `d` the entry's target depth, `beta` the global sharpness.
///
/// `D(r) = 1 / (1 + (r/d)^beta)`; `g(r) = D(r) / D(1)`. So `g(1) == 1`, `g`
/// is monotone decreasing in `r`, with a polynomial tail.
pub(crate) fn g(r: usize, d: f32, beta: f32) -> f32 {
    let rf = r as f32;
    // g(r) = D(r)/D(1) = (1 + (1/d)^beta) / (1 + (r/d)^beta).
    (1.0 + (1.0 / d).powf(beta)) / (1.0 + (rf / d).powf(beta))
}

/// Tune-on (`Train`) vs held-out (`Holdout`) partition. The ranker is tuned
/// against the `Train` split only; `Holdout` is the overfit check — a tune
/// that lifts `Train` but not `Holdout` is overfitting. Not wire-encoded
/// directly: derived from [`SentenceEntry::holdout`] via [`SentenceEntry::split`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Split {
    Train,
    Holdout,
}

/// Fixture-wide fallback weight, used when neither the entry nor the fixture
/// specifies one. Entries sit at 1.0 by default, so the fixture sets
/// `default-weight` once and entries only carry `w` to deviate.
fn default_weight() -> f32 {
    1.0
}

/// Fixture-wide fallback target depth, used when an item omits `d`.
fn default_target_depth() -> f32 {
    3.0
}

/// `skip_serializing_if` predicate: omit `holdout` when it is the `false`
/// default, so a re-serialized fixture stays terse.
fn is_false(b: &bool) -> bool {
    !*b
}

/// One scored item within an entry's `want` set. Each item is ranked on
/// its OWN rank and contributes one vote; an N-item entry carries N votes.
/// `d`/`w` override the fixture-level defaults when present; [`load`]
/// resolves them to concrete values, so callers should read them via
/// [`ExpectedItem::effective_depth`] / [`ExpectedItem::effective_weight`].
#[derive(Clone, Debug, Deserialize, JsonSchema, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExpectedItem {
    #[serde(rename = "cat")]
    pub category: String,
    pub id: String,
    #[serde(rename = "d", default, skip_serializing_if = "Option::is_none")]
    pub target_depth: Option<f32>,
    #[serde(rename = "w", default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<f32>,
}

impl ExpectedItem {
    /// Resolved target depth: the item's override or the fixture default.
    pub fn effective_depth(&self) -> f32 {
        self.target_depth.unwrap_or_else(default_target_depth)
    }

    /// Resolved weight: the item's override or the fixture default.
    pub fn effective_weight(&self) -> f32 {
        self.weight.unwrap_or_else(default_weight)
    }
}

#[derive(Clone, Debug, Deserialize, JsonSchema, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SentenceEntry {
    pub query: String,
    #[serde(rename = "want")]
    pub expected_set: Vec<ExpectedItem>,
    /// Held out from tuning when `true`; absent (the default) ⇒ `Train`.
    /// `false` is accepted but redundant.
    #[serde(default, skip_serializing_if = "is_false")]
    pub holdout: bool,
}

impl SentenceEntry {
    /// Partition this entry belongs to: [`Split::Holdout`] iff flagged
    /// `holdout: true`, else [`Split::Train`].
    pub fn split(&self) -> Split {
        if self.holdout {
            Split::Holdout
        } else {
            Split::Train
        }
    }
}

#[derive(Clone, Debug, Deserialize, JsonSchema, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SentenceFixture {
    pub version: u32,
    /// Weight applied to items that omit `w`; defaults to 1.0 when the
    /// fixture omits the field too.
    #[serde(rename = "default-weight", default = "default_weight")]
    pub default_weight: f32,
    /// Target depth applied to items that omit `d`; defaults to 3.0
    /// when the fixture omits the field too.
    #[serde(rename = "default-target-depth", default = "default_target_depth")]
    pub default_target_depth: f32,
    pub entries: Vec<SentenceEntry>,
}

pub fn load() -> Result<SentenceFixture> {
    from_str(SENTENCE_FIXTURE_YAML)
}

/// Parse + validate a fixture, resolving each item's depth/weight against the
/// fixture defaults so downstream code sees concrete values.
fn from_str(src: &str) -> Result<SentenceFixture> {
    let mut f: SentenceFixture = serde_yaml_ng::from_str(src)?;
    anyhow::ensure!(
        f.version == SENTENCE_FIXTURE_VERSION,
        "sentence-fixture.yaml version mismatch: expected {}, got {}",
        SENTENCE_FIXTURE_VERSION,
        f.version,
    );
    anyhow::ensure!(
        f.default_weight > 0.0 && f.default_weight.is_finite(),
        "sentence-fixture.yaml default-weight must be positive and finite, got {}",
        f.default_weight,
    );
    anyhow::ensure!(
        f.default_target_depth > 0.0 && f.default_target_depth.is_finite(),
        "sentence-fixture.yaml default-target-depth must be positive and finite, got {}",
        f.default_target_depth,
    );
    let default_w = f.default_weight;
    let default_d = f.default_target_depth;
    for e in &mut f.entries {
        for item in &mut e.expected_set {
            item.target_depth.get_or_insert(default_d);
            item.weight.get_or_insert(default_w);
        }
    }
    for (i, e) in f.entries.iter().enumerate() {
        anyhow::ensure!(
            !e.expected_set.is_empty(),
            "entry {i} has empty want-set (query={:?})",
            e.query
        );
        for (j, item) in e.expected_set.iter().enumerate() {
            let d = item.effective_depth();
            anyhow::ensure!(
                d > 0.0 && d.is_finite(),
                "entry {i} item {j} has non-positive target depth {d} (query={:?})",
                e.query
            );
            let w = item.effective_weight();
            anyhow::ensure!(
                w > 0.0 && w.is_finite(),
                "entry {i} item {j} has non-positive weight {w} (query={:?})",
                e.query
            );
        }
    }
    Ok(f)
}

#[derive(Debug)]
pub struct Score {
    pub per_category: BTreeMap<String, f32>,
    pub total: f32,
}

/// One scored unit: a single expectedSet item's contribution. Each item is
/// ranked on its own rank and produces exactly one vote.
#[derive(Clone)]
pub struct Vote {
    pub category: String,
    pub weight: f32,
    pub gain: f32,
    pub split: Split,
}

/// Per-category weighted average of `gain` → unweighted average across
/// categories. Independent of per-category vote count (a category with 100
/// votes contributes the same as one with 5) and supports per-vote weights
/// (curator can mark some items as more important).
///
/// The scored unit is the vote/item; an N-item entry contributes N votes.
pub fn score(votes: &[Vote]) -> Score {
    let mut per_cat: BTreeMap<String, (f32, f32)> = BTreeMap::new();
    for v in votes {
        let bucket = per_cat.entry(v.category.clone()).or_insert((0.0, 0.0));
        bucket.0 += v.weight * v.gain;
        bucket.1 += v.weight;
    }
    let per_cat: BTreeMap<String, f32> = per_cat
        .into_iter()
        .map(|(c, (h, w))| (c, if w > 0.0 { h / w } else { 0.0 }))
        .collect();
    let total = if per_cat.is_empty() {
        0.0
    } else {
        per_cat.values().sum::<f32>() / per_cat.len() as f32
    };
    Score {
        per_category: per_cat,
        total,
    }
}

/// `score()` restricted to votes in `split`.
pub fn score_split(votes: &[Vote], split: Split) -> Score {
    let filtered: Vec<Vote> = votes.iter().filter(|v| v.split == split).cloned().collect();
    score(&filtered)
}

/// Per-split + overall sentence-fixture scores plus per-category entry
/// counts (for reporting). Produced by [`eval`]; consumed by the baseline
/// test and the tuning dashboard.
pub(crate) struct SentenceEval {
    pub all: Score,
    pub train: Score,
    pub holdout: Score,
    pub n_entries: usize,
    pub per_category_n: BTreeMap<String, usize>,
}

impl SentenceEval {
    /// Multi-line human report; shared by the baseline test and the
    /// dashboard so the format has one definition.
    pub fn render(&self) -> String {
        let mut s = format!(
            "[sentence-fixture] total={:.3}  train={:.3}  \
             holdout={:.3} (overfit-watch — never tune on this)  ({} entries)\n",
            self.all.total, self.train.total, self.holdout.total, self.n_entries
        );
        for (cat, score) in &self.all.per_category {
            let n = self.per_category_n.get(cat).copied().unwrap_or(0);
            s.push_str(&format!("  {cat:<20} {score:.3}  (n={n})\n"));
        }
        s
    }
}

/// Embed every unique fixture query once, rank each entry (applying the
/// lookup-map hard-promote, mirroring production), and score per split +
/// overall. `tuning` is threaded so a future in-process search can vary it;
/// the dashboard and the baseline test pass the committed `tuning()`.
pub(crate) fn eval(assets: &Assets, tuning: &Tuning) -> Result<SentenceEval> {
    let fixture = load()?;
    let all_queries: Vec<String> = fixture.entries.iter().map(|e| e.query.clone()).collect();
    let cache = fixtures::embed_unique(&all_queries)?;
    Ok(eval_cached(&fixture, &cache, assets, tuning))
}

/// [`eval`] split: score a pre-loaded fixture against an already-embedded query
/// cache. Embedding is tuning-independent, so a tuning sweep embeds once and
/// calls this per variant — re-ranking cached vectors only, no re-embed.
pub(crate) fn eval_cached(
    fixture: &SentenceFixture,
    cache: &std::collections::HashMap<String, Vec<f32>>,
    assets: &Assets,
    tuning: &Tuning,
) -> SentenceEval {
    let map_idx = LookupIndex::from_map(lookup_map::build(&assets.corpus));
    let mut votes: Vec<Vote> = Vec::new();
    let mut per_category_n: BTreeMap<String, usize> = BTreeMap::new();
    for e in &fixture.entries {
        let qvec = cache.get(e.query.as_str()).expect("cached vector");
        let resolver_hit = resolver_key(&e.query, None, &assets.corpus);
        let mut ranked = rank::rank(
            &e.query,
            qvec,
            resolver_hit.as_ref(),
            None,
            &assets.index,
            tuning,
        );
        if let Some((hit_cat, hit_id)) = map_idx.lookup(&e.query) {
            search::promote_to_top(&mut ranked, hit_cat, hit_id);
        }
        // One vote per item: each scored on its OWN 1-based rank. A missing
        // item (shouldn't happen — all corpus records are ranked) is treated
        // as just past the end so g → ~0 rather than panicking.
        for item in &e.expected_set {
            let item_rank = ranked
                .iter()
                .position(|m| m.rec.category == item.category && m.rec.id == item.id)
                .map(|p| p + 1)
                .unwrap_or(ranked.len() + 1);
            let gain = g(item_rank, item.effective_depth(), BETA);
            votes.push(Vote {
                category: item.category.clone(),
                weight: item.effective_weight(),
                gain,
                split: e.split(),
            });
            *per_category_n.entry(item.category.clone()).or_insert(0) += 1;
        }
    }
    SentenceEval {
        all: score(&votes),
        train: score_split(&votes, Split::Train),
        holdout: score_split(&votes, Split::Holdout),
        n_entries: fixture.entries.len(),
        per_category_n,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::load_corpus;
    use crate::nlp::rules::tuning;

    #[test]
    fn sentence_fixture_loads_and_validates() {
        let f = load().expect("load sentence-fixture.yaml");
        assert!(!f.entries.is_empty(), "fixture should not be empty");
        // Spot-check shape; details validated by serde + load() invariants.
        for e in &f.entries {
            assert!(!e.query.trim().is_empty(), "query empty");
            for item in &e.expected_set {
                assert!(item.effective_weight() > 0.0, "weight must be positive");
            }
        }
    }

    /// Verify every `expectedSet` entry names an actual corpus record.
    /// Pure on corpus — no model/index assets required.
    #[test]
    fn sentence_fixture_expected_records_exist() {
        let corpus = load_corpus().expect("load_corpus");
        let f = load().expect("load fixture");
        let mut known: std::collections::BTreeSet<(String, String)> =
            std::collections::BTreeSet::new();
        for cat in &corpus.categories {
            for rec in &cat.records {
                let id = crate::tools::record_fields::record_id(cat.name, rec);
                if !id.is_empty() {
                    known.insert((cat.name.to_string(), id));
                }
            }
        }
        let mut missing: Vec<String> = Vec::new();
        for e in &f.entries {
            for want in &e.expected_set {
                if !known.contains(&(want.category.clone(), want.id.clone())) {
                    missing.push(format!(
                        "  query={:?} expects {}/{} — no such record",
                        e.query, want.category, want.id
                    ));
                }
            }
        }
        assert!(
            missing.is_empty(),
            "sentence-fixture references non-existent records:\n{}",
            missing.join("\n")
        );
    }

    /// Eval reporter: print the per-split + per-category breakdown (no gate;
    /// see `NLP.md`). Skip-gated on the embedder + index assets, which no CI
    /// job stages — this stays a local-only reporter.
    #[test]
    fn sentence_fixture_eval_report() {
        if fixtures::skip_if_assets_missing("sentence_report") {
            return;
        }
        let assets = fixtures::assets().expect("load assets");
        let e = eval(assets, tuning()).expect("eval sentence fixture");
        eprint!("{}", e.render());
        assert!(
            e.all.total.is_finite() && (0.0..=1.0).contains(&e.all.total),
            "sentence-fixture total out of range: {}",
            e.all.total
        );
    }

    fn vote(cat: &str, weight: f32, gain: f32, split: Split) -> Vote {
        Vote {
            category: cat.to_string(),
            weight,
            gain,
            split,
        }
    }

    #[test]
    fn score_is_per_category_normalized() {
        // Category A: 10 votes, all hit. Category B: 1 vote, miss.
        // Per-category-normalized total = (1.0 + 0.0) / 2 = 0.5; independent
        // of per-category vote count.
        let mut votes: Vec<Vote> = (0..10).map(|_| vote("A", 1.0, 1.0, Split::Train)).collect();
        votes.push(vote("B", 1.0, 0.0, Split::Train));
        let s = score(&votes);
        assert!((s.total - 0.5).abs() < 1e-6, "got {}", s.total);
        assert!((s.per_category["A"] - 1.0).abs() < 1e-6);
        assert!((s.per_category["B"] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn score_respects_vote_weights() {
        // Same category, 2 votes: one hits (weight 3), one misses (weight 1).
        // Per-category score = (3*1 + 1*0) / (3+1) = 0.75.
        let votes = vec![
            vote("X", 3.0, 1.0, Split::Train),
            vote("X", 1.0, 0.0, Split::Train),
        ];
        let s = score(&votes);
        assert!((s.total - 0.75).abs() < 1e-6, "got {}", s.total);
    }

    #[test]
    fn score_split_partitions_by_split() {
        // Same category, two votes: train misses, holdout hits.
        let votes = vec![
            vote("X", 1.0, 0.0, Split::Train),
            vote("X", 1.0, 1.0, Split::Holdout),
        ];
        let train = score_split(&votes, Split::Train);
        let holdout = score_split(&votes, Split::Holdout);
        assert!(train.total.abs() < 1e-6, "train got {}", train.total);
        assert!(
            (holdout.total - 1.0).abs() < 1e-6,
            "holdout got {}",
            holdout.total
        );
    }

    #[test]
    fn item_override_resolution() {
        // Item overrides are used when present; absent values fall back to the
        // fixture-level defaults via the accessors.
        let with_overrides = ExpectedItem {
            category: "a0".to_string(),
            id: "X".to_string(),
            target_depth: Some(5.0),
            weight: Some(7.0),
        };
        let bare = ExpectedItem {
            category: "a0".to_string(),
            id: "Y".to_string(),
            target_depth: None,
            weight: None,
        };
        assert_eq!(with_overrides.effective_depth(), 5.0);
        assert_eq!(with_overrides.effective_weight(), 7.0);
        assert_eq!(bare.effective_depth(), default_target_depth());
        assert_eq!(bare.effective_weight(), default_weight());
    }

    #[test]
    fn multi_item_entry_yields_one_vote_per_item() {
        // A 3-item entry contributes 3 votes; per-category count sums items.
        let items: Vec<ExpectedItem> = ["X", "Y", "Z"]
            .iter()
            .map(|id| ExpectedItem {
                category: "cat".to_string(),
                id: id.to_string(),
                target_depth: None,
                weight: None,
            })
            .collect();
        let votes: Vec<Vote> = items
            .iter()
            .map(|i| vote(&i.category, 1.0, 1.0, Split::Train))
            .collect();
        assert_eq!(votes.len(), 3);
        let s = score(&votes);
        assert!((s.total - 1.0).abs() < 1e-6, "got {}", s.total);
    }

    #[test]
    fn discount_g_is_normalized_and_monotone() {
        // g(1) == 1 regardless of target depth.
        for d in [1.0_f32, 3.0, 5.0] {
            assert!((g(1, d, BETA) - 1.0).abs() < 1e-6, "g(1,{d}) != 1");
        }
        // Monotone decreasing in r, staying positive (polynomial tail).
        assert!(g(100, 1.0, 2.0) > g(1000, 1.0, 2.0));
        assert!(g(1000, 1.0, 2.0) > 0.0);
        // At r == d: g = (1 + (1/d)^beta) / 2.
        for d in [2.0_f32, 4.0] {
            let want = (1.0 + (1.0 / d).powf(BETA)) / 2.0;
            assert!(
                (g(d as usize, d, BETA) - want).abs() < 1e-6,
                "g(d,d) for d={d}"
            );
        }
    }

    #[test]
    fn omitted_item_values_inherit_fixture_defaults() {
        // Item with no weight/targetDepth inherits the fixture defaults; an
        // item with explicit overrides keeps them.
        let src = format!(
            "version: {SENTENCE_FIXTURE_VERSION}\n\
             default-weight: 2.0\n\
             default-target-depth: 5.0\n\
             entries:\n\
             \x20 - query: alpha\n\
             \x20   want:\n\
             \x20     - {{cat: c, id: i}}\n\
             \x20     - {{cat: c, id: j, w: 0.5, d: 1}}\n"
        );
        let f = from_str(&src).expect("parse synthetic fixture");
        assert_eq!(f.default_weight, 2.0);
        assert_eq!(f.default_target_depth, 5.0);
        let items = &f.entries[0].expected_set;
        assert_eq!(
            items[0].effective_weight(),
            2.0,
            "omitted weight -> default"
        );
        assert_eq!(items[0].effective_depth(), 5.0, "omitted depth -> default");
        assert_eq!(items[1].effective_weight(), 0.5, "explicit weight kept");
        assert_eq!(items[1].effective_depth(), 1.0, "explicit depth kept");
    }

    #[test]
    fn fixture_defaults_fall_back_when_omitted() {
        // With no default-weight / default-target-depth in the fixture, a bare
        // item inherits the built-in fallbacks (1.0 / 3.0).
        let src = format!(
            "version: {SENTENCE_FIXTURE_VERSION}\n\
             entries:\n\
             \x20 - query: alpha\n\
             \x20   want: [{{cat: c, id: i}}]\n"
        );
        let f = from_str(&src).expect("parse fixture without fixture-level defaults");
        assert_eq!(f.default_weight, 1.0);
        assert_eq!(f.default_target_depth, 3.0);
        let item = &f.entries[0].expected_set[0];
        assert_eq!(item.effective_weight(), 1.0);
        assert_eq!(item.effective_depth(), 3.0);
    }

    #[test]
    fn holdout_flag_drives_split() {
        // Omitting `holdout` ⇒ Train; `holdout: true` ⇒ Holdout. `holdout:
        // false` is accepted and equivalent to omitting it.
        let src = format!(
            "version: {SENTENCE_FIXTURE_VERSION}\n\
             entries:\n\
             \x20 - query: a\n\
             \x20   want: [{{cat: c, id: i}}]\n\
             \x20 - query: b\n\
             \x20   want: [{{cat: c, id: j}}]\n\
             \x20   holdout: true\n\
             \x20 - query: c\n\
             \x20   want: [{{cat: c, id: k}}]\n\
             \x20   holdout: false\n"
        );
        let f = from_str(&src).expect("parse holdout fixture");
        assert_eq!(f.entries[0].split(), Split::Train, "omitted ⇒ train");
        assert_eq!(f.entries[1].split(), Split::Holdout, "true ⇒ holdout");
        assert_eq!(f.entries[2].split(), Split::Train, "false ⇒ train");
    }
}
