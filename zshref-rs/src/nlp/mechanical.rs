// Corpus-derived "mechanical" sentence source for natural-language search
// evaluation. Unlike the hand-curated `sentence_fixture`, every entry here is
// generated from the corpus, so the set is large and free. Two registers:
//
// - **Terse decorated forms** — the decorated lookup-contract phrasings
//   (`option AUTO_CD`, `setopt builtin`, …), reused verbatim.
// - **NL-question forms** — per-category question templates over each
//   record's display form (`nl_questions`); `special_param` also gets a
//   `$`-prefixed variant ("what is the $# parameter").
//
// All entries fold into the SAME continuous scoring model as the curated
// fixture (`sentence_fixture::{g, score, BETA}`); no duplication. The combined
// total blends curated `train` and mechanical via `LAMBDA`. A binary
// "#1-violation count per category" is retained as a reported (never-gated)
// hard-check signal.
//
// Test-only — not loaded by the ranker at runtime.

use crate::nlp::contract;
use crate::nlp::lookup_map::{self, LookupIndex};
use crate::nlp::rank;
use crate::nlp::rules::Tuning;
use crate::nlp::search::{self, resolver_key};
use crate::nlp::sentence_fixture::{self, score, ExpectedItem, SentenceEntry, Vote, BETA};
use crate::nlp::{fixtures, fixtures::Assets};
use crate::tools::record_fields::{record_display, record_id};
use anyhow::Result;
use std::collections::BTreeMap;

/// Curated/mechanical blend weight for the combined total:
/// `total = LAMBDA * curated_train + (1 - LAMBDA) * mechanical_total`.
pub(crate) const LAMBDA: f32 = 0.5;

/// Single definition of the blend, shared by all callers so they can't diverge.
pub(crate) fn combined_total(curated_train: f32, mechanical_total: f32) -> f32 {
    LAMBDA * curated_train + (1.0 - LAMBDA) * mechanical_total
}

/// All entries sit at unit depth + weight, Train split: mechanical entries
/// demand a true top-1 surface (`target_depth = 1.0`) and contribute equally.
const TARGET_DEPTH: f32 = 1.0;

/// NL-question template(s) per eligible category — mirrors the node QA
/// hard-checks, plus a `zle_widget` form they lack. Empty for other categories.
///
/// `special_param` additionally yields a `$`-prefixed variant ("what is the
/// $# parameter") — the form users actually type. It is neither resolver- nor
/// lookup-map-reachable (the resolver only strips `IDENT[subscript]`, and the
/// map holds bare names), so unlike a bare form it is never hard-promoted: it
/// is genuine ranker signal for the `$NAME`-in-a-sentence path.
fn nl_questions(category: &str, display: &str) -> Vec<String> {
    match category {
        "builtin" => vec![format!("what does the {display} builtin do")],
        "special_param" => vec![
            format!("what is the {display} parameter"),
            format!("what is the ${display} parameter"),
        ],
        "option" => vec![format!("what does the {display} option do")],
        "reserved_word" => vec![format!("what does the {display} reserved word do")],
        "mathfunc" => vec![format!("what does the {display} math function do")],
        "comp_utility" => vec![format!("what does the {display} completion function do")],
        "zle_widget" => vec![format!("what does the {display} widget do")],
        _ => vec![],
    }
}

/// Build the full mechanical entry set: decorated lookup-contract phrasings +
/// NL-question forms for the seven eligible categories.
pub(crate) fn build(assets: &Assets) -> Vec<SentenceEntry> {
    let mut entries: Vec<SentenceEntry> = Vec::new();

    // (1) Terse decorated forms — reuse the contract's decorated phrasings.
    let contract = contract::build(&assets.corpus);
    for e in contract.entries {
        if !e.phrasing_kind.is_decorated() {
            continue;
        }
        // Mechanical entries have exactly one defined answer: the record the
        // decorated phrasing was generated from — not the contract's OR-set.
        entries.push(SentenceEntry {
            query: e.query,
            expected_set: vec![ExpectedItem {
                category: e.record.category,
                id: e.record.id,
                target_depth: Some(TARGET_DEPTH),
                weight: Some(1.0),
            }],
            holdout: false,
        });
    }

    // (2) NL-question forms — template on each record's display form.
    for cat in &assets.corpus.categories {
        for rec in &cat.records {
            let id = record_id(cat.name, rec);
            if id.is_empty() {
                continue;
            }
            let display = record_display(cat.name, rec);
            for query in nl_questions(cat.name, &display) {
                entries.push(SentenceEntry {
                    query,
                    expected_set: vec![ExpectedItem {
                        category: cat.name.to_string(),
                        id: id.clone(),
                        target_depth: Some(TARGET_DEPTH),
                        weight: Some(1.0),
                    }],
                    holdout: false,
                });
            }
        }
    }

    entries
}

/// Predicate selecting one [`SLICES`] bucket from an expected record's id.
type SlicePred = fn(&str) -> bool;

/// Cross-cutting "hard slice" buckets over the expected record's id, cutting
/// *across* categories. Short and punctuation-only ids are where embedding
/// retrieval is weakest yet they hide inside the category means — these
/// surface them. Diagnostic only: reported, never gated, never tuned toward.
/// Slices overlap by design (a 1-char punctuation id lands in both `len 1`
/// and `punctuation-only`).
const SLICES: &[(&str, SlicePred)] = &[
    ("id length 1", |id| id.chars().count() == 1),
    ("id length 2", |id| id.chars().count() == 2),
    ("id length 3", |id| id.chars().count() == 3),
    ("id length 4", |id| id.chars().count() == 4),
    ("punctuation-only", |id| {
        !id.is_empty() && id.chars().all(|c| !c.is_alphanumeric())
    }),
];

/// One slice's accumulated stats. `mean_gain` is a flat per-item mean (the
/// slice is a property, not a category, so no per-category normalization);
/// `fails` counts items that did NOT rank #1 (mechanical `target_depth = 1`,
/// so "not top-1" is the natural binary miss).
pub(crate) struct SliceStat {
    pub label: &'static str,
    pub n: usize,
    pub fails: usize,
    pub mean_gain: f32,
}

/// Mechanical-eval result: the component score (per-category mean of gains
/// then unweighted mean across categories), per-category entry counts, the
/// retained binary #1-violation counts per category, and the cross-cutting
/// hard slices.
pub(crate) struct MechanicalEval {
    pub component: sentence_fixture::Score,
    pub n_entries: usize,
    pub per_category_n: BTreeMap<String, usize>,
    /// Entries whose expected record did NOT rank at top-1, grouped by the
    /// item's category. Reported, never gated, never tuned toward.
    pub violations: BTreeMap<String, usize>,
    /// Cross-cutting id-shape slices (see [`SLICES`]).
    pub slices: Vec<SliceStat>,
}

impl MechanicalEval {
    pub fn render(&self) -> String {
        let mut s = format!(
            "[mechanical] total={:.3}  ({} entries)\n",
            self.component.total, self.n_entries
        );
        for (cat, score) in &self.component.per_category {
            let n = self.per_category_n.get(cat).copied().unwrap_or(0);
            let v = self.violations.get(cat).copied().unwrap_or(0);
            s.push_str(&format!(
                "  {cat:<20} {score:.3}  (n={n}, #1-violations={v})\n"
            ));
        }
        s
    }
}

/// Embed every unique mechanical query once, rank each entry (lookup-map
/// hard-promote applied, mirroring production), score its single item on its
/// own 1-based rank as one vote per the continuous discount. Also tallies the
/// binary per-category #1-violation counts.
pub(crate) fn eval(
    entries: &[SentenceEntry],
    assets: &Assets,
    tuning: &Tuning,
) -> Result<MechanicalEval> {
    let all_queries: Vec<String> = entries.iter().map(|e| e.query.clone()).collect();
    let cache = fixtures::embed_unique(&all_queries)?;
    Ok(eval_cached(entries, &cache, assets, tuning))
}

/// [`eval`] split: score pre-built entries against an already-embedded query
/// cache, re-ranking cached vectors only (no re-embed). Lets a tuning sweep
/// embed once and call this per variant.
pub(crate) fn eval_cached(
    entries: &[SentenceEntry],
    cache: &std::collections::HashMap<String, Vec<f32>>,
    assets: &Assets,
    tuning: &Tuning,
) -> MechanicalEval {
    let map_idx = LookupIndex::from_map(lookup_map::build(&assets.corpus));

    let mut votes: Vec<Vote> = Vec::with_capacity(entries.len());
    let mut violations: BTreeMap<String, usize> = BTreeMap::new();
    let mut per_category_n: BTreeMap<String, usize> = BTreeMap::new();
    // Per-slice (sum_gain, n, fails), index-aligned with `SLICES`.
    let mut slice_acc: Vec<(f32, usize, usize)> = vec![(0.0, 0, 0); SLICES.len()];
    for e in entries {
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
        // Every mechanical entry has exactly one item → one vote.
        for item in &e.expected_set {
            let item_rank = ranked
                .iter()
                .position(|m| m.rec.category == item.category && m.rec.id == item.id)
                .map(|p| p + 1)
                .unwrap_or(ranked.len() + 1);
            let gain = sentence_fixture::g(item_rank, item.effective_depth(), BETA);
            votes.push(Vote {
                category: item.category.clone(),
                weight: item.effective_weight(),
                gain,
                split: e.split(),
            });
            *per_category_n.entry(item.category.clone()).or_insert(0) += 1;
            if item_rank != 1 {
                *violations.entry(item.category.clone()).or_insert(0) += 1;
            }
            for (i, (_, pred)) in SLICES.iter().enumerate() {
                if pred(&item.id) {
                    slice_acc[i].0 += gain;
                    slice_acc[i].1 += 1;
                    if item_rank != 1 {
                        slice_acc[i].2 += 1;
                    }
                }
            }
        }
    }

    let slices = SLICES
        .iter()
        .zip(slice_acc)
        .map(|((label, _), (sum_gain, n, fails))| SliceStat {
            label,
            n,
            fails,
            mean_gain: if n > 0 { sum_gain / n as f32 } else { 0.0 },
        })
        .collect();

    MechanicalEval {
        component: score(&votes),
        n_entries: entries.len(),
        per_category_n,
        violations,
        slices,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::load_corpus;
    use crate::nlp::rules::tuning;

    /// Cap for the debug-build smoke: enough entries to exercise the embed →
    /// rank → score → violation-tally path without the assets-heavy full run.
    const MECHANICAL_SMOKE_LIMIT: usize = 16;

    #[test]
    fn nl_question_templates_seven_categories() {
        for (cat, display) in [
            ("builtin", "fc"),
            ("special_param", "PATH"),
            ("option", "AUTO_CD"),
            ("reserved_word", "if"),
            ("mathfunc", "abs"),
            ("comp_utility", "_arguments"),
            ("zle_widget", "accept-line"),
        ] {
            assert!(!nl_questions(cat, display).is_empty(), "{cat} templated");
        }
        // special_param yields the plain + a `$`-prefixed variant.
        let sp = nl_questions("special_param", "#");
        assert_eq!(sp.len(), 2);
        assert!(
            sp.iter().any(|q| q.contains("$#")),
            "$-prefixed form: {sp:?}"
        );
        // Intentionally NOT templated (not a hardChecks category).
        assert!(nl_questions("redirection", ">").is_empty());
    }

    /// The mechanical set is non-trivial and every entry is well-formed.
    /// Pure on corpus — no model/index assets required.
    #[test]
    fn mechanical_build_is_well_formed() {
        let corpus = load_corpus().expect("load_corpus");
        let assets_corpus = corpus;
        // build() needs an Assets, but the corpus-derived parts only touch
        // `assets.corpus`; assert on the corpus-only generation directly.
        let contract = contract::build(&assets_corpus);
        let decorated = contract
            .entries
            .iter()
            .filter(|e| e.phrasing_kind.is_decorated())
            .count();
        assert!(decorated > 0, "expected decorated contract entries");

        let mut nl = 0usize;
        for cat in &assets_corpus.categories {
            for rec in &cat.records {
                if record_id(cat.name, rec).is_empty() {
                    continue;
                }
                nl += nl_questions(cat.name, &record_display(cat.name, rec)).len();
            }
        }
        assert!(nl > 0, "expected NL-question entries");
    }

    /// Fast smoke: exercise the embed → rank → score → violation path on a
    /// small capped subset so debug builds stay cheap. Skip-gated on assets.
    #[test]
    fn mechanical_smoke() {
        if fixtures::skip_if_assets_missing("BZ_REQUIRE_MECHANICAL", "mechanical_smoke") {
            return;
        }
        let assets = fixtures::assets().expect("load assets");
        let mut entries = build(assets);
        entries.truncate(MECHANICAL_SMOKE_LIMIT);
        let e = eval(&entries, assets, tuning()).expect("mechanical eval");
        assert_eq!(e.n_entries, entries.len());
        assert!(e.component.total >= 0.0 && e.component.total <= 1.0);
    }

    /// Heavy eval reporter: embed + rank the full mechanical set and print the
    /// component + combined scores and per-category #1-violation counts.
    /// Release-only (embeds thousands of queries); skip-gated on embedder +
    /// index assets. Not a gate — see `NLP.md`.
    #[test]
    fn mechanical_sentences_report() {
        if cfg!(debug_assertions) {
            eprintln!(
                "[skip] mechanical_sentences_report: release-only (embeds thousands of \
                 queries); run with `cargo test --release --features nlp \
                 mechanical_sentences_report -- --nocapture`"
            );
            return;
        }
        if fixtures::skip_if_assets_missing("BZ_REQUIRE_MECHANICAL", "mechanical_report") {
            return;
        }
        let assets = fixtures::assets().expect("load assets");
        let entries = build(assets);
        let mech = eval(&entries, assets, tuning()).expect("mechanical eval");
        let curated = sentence_fixture::eval(assets, tuning()).expect("curated eval");

        let curated_train = curated.train.total;
        let mechanical_total = mech.component.total;
        let combined = combined_total(curated_train, mechanical_total);

        eprint!("{}", mech.render());
        eprintln!(
            "[combined] curated_train={curated_train:.3}  mechanical={mechanical_total:.3}  \
             λ={LAMBDA}  total={combined:.3}"
        );
    }
}
