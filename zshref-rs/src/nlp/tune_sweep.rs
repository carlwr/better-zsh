// One-knob-at-a-time rank-time tuning sweep (opt-in dev tool, not a CI gate).
//
// Rank-time knobs never re-embed queries or corpus vectors — only the ranker
// arithmetic changes. So this embeds the curated + mechanical queries ONCE, then
// re-ranks the cached vectors for every variant: a whole grid in one run with no
// per-variant recompile (editing the `include_str!`'d yaml would recompile each
// iteration). Objective is the same train/mechanical blend the dashboard scores;
// `holdout` is printed as the overfit watch, never optimized.
//
// `BZ_TUNE_SWEEP=1` sweeps each knob around the committed baseline.
// `BZ_TUNE_BASE="disc_len=3,cat=0.01"` first applies overrides, so each knob is
// then swept around that composed point — the greedy loop is: sweep, fold the
// best into BZ_TUNE_BASE, repeat (one-at-a-time misses cross-knob interactions).

#![cfg(test)]

use crate::nlp::eval_diff::{churn, per_item, ItemRes};
use crate::nlp::fixtures::{self, Assets};
use crate::nlp::mechanical;
use crate::nlp::rules::{tuning, Tuning};
use crate::nlp::sentence_fixture::{self, SentenceEntry, SentenceFixture, Split};
use std::collections::HashMap;

/// One variant's scores; `combined` is the optimization target.
#[derive(Clone, Copy)]
struct Scores {
    train: f32,
    holdout: f32,
    mechanical: f32,
    combined: f32,
}

/// Assets + both query caches, embedded once and reused across all variants.
struct Bench {
    assets: &'static Assets,
    fixture: SentenceFixture,
    curated_cache: HashMap<String, Vec<f32>>,
    mech_entries: Vec<SentenceEntry>,
    mech_cache: HashMap<String, Vec<f32>>,
}

impl Bench {
    fn load() -> Self {
        let assets = fixtures::assets().expect("load assets");
        let fixture = sentence_fixture::load().expect("load sentence fixture");
        let curated_q: Vec<String> = fixture.entries.iter().map(|e| e.query.clone()).collect();
        let curated_cache = fixtures::embed_unique(&curated_q).expect("embed curated once");

        let mech_entries = mechanical::build(assets);
        let mech_q: Vec<String> = mech_entries.iter().map(|e| e.query.clone()).collect();
        eprintln!(
            "embedding {} curated + {} mechanical queries once…",
            curated_q.len(),
            mech_q.len()
        );
        let mech_cache = fixtures::embed_unique(&mech_q).expect("embed mechanical once");

        Bench {
            assets,
            fixture,
            curated_cache,
            mech_entries,
            mech_cache,
        }
    }

    fn score(&self, tuning: &Tuning) -> Scores {
        let c =
            sentence_fixture::eval_cached(&self.fixture, &self.curated_cache, self.assets, tuning);
        let m = mechanical::eval_cached(&self.mech_entries, &self.mech_cache, self.assets, tuning);
        Scores {
            train: c.train.total,
            holdout: c.holdout.total,
            mechanical: m.component.total,
            combined: mechanical::combined_total(c.train.total, m.component.total),
        }
    }
}

/// Apply one `key=value` override. Panics on an unknown key so a `BZ_TUNE_BASE`
/// typo fails loudly. Keys mirror the `tuning.yaml` knobs. Shared with the
/// dashboard (`tune.rs`) so both compose `BZ_TUNE_BASE` identically.
pub(crate) fn apply_override(t: &mut Tuning, key: &str, val: &str) {
    let f = || val.parse::<f32>().expect("f32 value");
    let u = || val.parse::<usize>().expect("usize value");
    match key {
        "body" => t.semantic_weights.body = f(),
        "structured" => t.semantic_weights.structured = f(),
        "sb_strength" => t.semantic_weights.short_body.strength = f(),
        "sb_length" => t.semantic_weights.short_body.length_scale = f(),
        "cat" => t.boosts.category = f(),
        "exact_inc" => t.boosts.exact_word_increment = f(),
        "resolver_inc" => t.boosts.resolver_increment = f(),
        "wo_scale" => t.boosts.word_overlap.scale = f(),
        "wo_halfsat" => t.boosts.word_overlap.half_sat = f(),
        "rarity" => t.penalties.category_rarity_max = f(),
        "disc_len" => t.lexical.min_discriminating_word_len = u(),
        "sig_len" => t.lexical.min_significant_word_len = u(),
        other => panic!("unknown BZ_TUNE_BASE key: {other:?}"),
    }
}

/// Committed baseline with any `BZ_TUNE_BASE` overrides folded in. Shared with
/// the dashboard so a candidate point reads the same in both tools.
pub(crate) fn composed_base() -> Tuning {
    let mut t = tuning().clone();
    if let Ok(spec) = std::env::var("BZ_TUNE_BASE") {
        for kv in spec.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            let (k, v) = kv
                .split_once('=')
                .expect("BZ_TUNE_BASE entries are key=value");
            apply_override(&mut t, k.trim(), v.trim());
        }
    }
    t
}

/// Sweep one knob: score each labelled mutation of `base`, print the combined
/// delta vs. `base`, and mark the base + best-combined rows.
fn sweep<F>(bench: &Bench, base: &Tuning, base_c: f32, knob: &str, points: &[(String, F)])
where
    F: Fn(&mut Tuning),
{
    eprintln!("\n── {knob} ───────────────────  (base combined={base_c:.4})");
    let rows: Vec<(String, Scores)> = points
        .iter()
        .map(|(label, mutate)| {
            let mut t = base.clone();
            mutate(&mut t);
            (label.clone(), bench.score(&t))
        })
        .collect();
    let best_i = rows
        .iter()
        .enumerate()
        .max_by(|a, b| a.1 .1.combined.total_cmp(&b.1 .1.combined))
        .map(|(i, _)| i);
    for (i, (label, s)) in rows.iter().enumerate() {
        let delta = s.combined - base_c;
        let mark = if Some(i) == best_i {
            " ◄ best"
        } else if delta.abs() < 1e-6 {
            " (base)"
        } else {
            ""
        };
        eprintln!(
            "  {label:<10} comb={c:.4} Δ={delta:+.4}  train={tr:.4} hold={ho:.4} mech={me:.4}{mark}",
            c = s.combined,
            tr = s.train,
            ho = s.holdout,
            me = s.mechanical,
        );
    }
}

/// Labelled points for a scalar knob: one row per value.
fn scan<F>(values: &[f32], set: F) -> Vec<(String, impl Fn(&mut Tuning))>
where
    F: Fn(&mut Tuning, f32) + Copy,
{
    values
        .iter()
        .map(move |&v| (format!("{v:.3}"), move |t: &mut Tuning| set(t, v)))
        .collect()
}

/// Labelled points for a `usize` knob over an inclusive range.
fn scan_usize(
    range: std::ops::RangeInclusive<usize>,
    set: fn(&mut Tuning, usize),
) -> Vec<(String, impl Fn(&mut Tuning))> {
    range
        .map(move |v| (v.to_string(), move |t: &mut Tuning| set(t, v)))
        .collect()
}

/// Sweep every rank-time knob around the composed base. Opt-in
/// (`BZ_TUNE_SWEEP=1`); release-only (debug ranking over the full set is slow).
/// Run via `make cli-tune-sweep`.
#[test]
fn tune_sweep() {
    if std::env::var_os("BZ_TUNE_SWEEP").is_none() {
        eprintln!("[skip] tune_sweep: set BZ_TUNE_SWEEP=1 (or run `make cli-tune-sweep`)");
        return;
    }
    if fixtures::skip_if_assets_missing("BZ_TUNE_SWEEP", "tune_sweep") {
        return;
    }
    let bench = Bench::load();
    let base = composed_base();
    let b = bench.score(&base);
    eprintln!(
        "\n=== tuning sweep (one knob at a time) ===\n\
         base: combined={:.4}  train={:.4}  holdout={:.4}  mechanical={:.4}  (BZ_TUNE_BASE={:?})",
        b.combined,
        b.train,
        b.holdout,
        b.mechanical,
        std::env::var("BZ_TUNE_BASE").unwrap_or_default(),
    );
    let bc = b.combined;

    use std::ops::RangeInclusive as R;
    sweep(
        &bench,
        &base,
        bc,
        "body",
        &scan(&[0.55, 0.60, 0.65, 0.70, 0.75, 0.80], |t, v| {
            t.semantic_weights.body = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "structured",
        &scan(&[0.05, 0.10, 0.15, 0.20, 0.25, 0.30], |t, v| {
            t.semantic_weights.structured = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "sb_strength",
        &scan(&[0.0, 0.06, 0.12, 0.18, 0.24, 0.30], |t, v| {
            t.semantic_weights.short_body.strength = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "sb_length",
        &scan(&[8.0, 16.0, 24.0, 32.0, 48.0, 64.0], |t, v| {
            t.semantic_weights.short_body.length_scale = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "cat",
        &scan(&[0.0, 0.01, 0.02, 0.04, 0.06, 0.10], |t, v| {
            t.boosts.category = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "exact_inc",
        &scan(&[0.0, 0.02, 0.04, 0.06, 0.08, 0.12], |t, v| {
            t.boosts.exact_word_increment = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "resolver_inc",
        &scan(&[0.0, 0.02, 0.06, 0.10, 0.16, 0.24], |t, v| {
            t.boosts.resolver_increment = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "wo_scale",
        &scan(&[0.10, 0.20, 0.30, 0.40, 0.50], |t, v| {
            t.boosts.word_overlap.scale = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "wo_halfsat",
        &scan(&[1.0, 2.0, 4.0, 6.0, 10.0, 16.0], |t, v| {
            t.boosts.word_overlap.half_sat = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "rarity",
        &scan(&[0.0, 0.01, 0.03, 0.06, 0.10, 0.16], |t, v| {
            t.penalties.category_rarity_max = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "disc_len",
        &scan_usize(R::new(2, 6), |t, v| {
            t.lexical.min_discriminating_word_len = v
        }),
    );
    sweep(
        &bench,
        &base,
        bc,
        "sig_len",
        &scan_usize(R::new(1, 4), |t, v| t.lexical.min_significant_word_len = v),
    );

    eprintln!("\n=== end sweep ===");
}

/// Item-level diff: base tuning vs the `BZ_TUNE_BASE` candidate, listing exactly
/// which fixture items change rank and how each move feeds the aggregate. The
/// aggregate sweep deltas are sub-0.01 on a small fixture, so a move is only
/// trustworthy once you can name the items behind it. Holdout is never printed
/// (curated movers are filtered to `Train`); mechanical entries are all `Train`.
/// Opt-in (`BZ_TUNE_DIFF=1`); release-only; `BZ_TUNE_BASE` names the candidate.
#[test]
fn tune_diff() {
    if std::env::var_os("BZ_TUNE_DIFF").is_none() {
        eprintln!("[skip] tune_diff: set BZ_TUNE_DIFF=1 and BZ_TUNE_BASE=<candidate>");
        return;
    }
    if fixtures::skip_if_assets_missing("BZ_TUNE_DIFF", "tune_diff") {
        return;
    }
    let bench = Bench::load();
    let base = tuning().clone();
    let cand = composed_base();
    let spec = std::env::var("BZ_TUNE_BASE").unwrap_or_default();
    eprintln!("\n=== tune diff: base vs candidate ===\ncandidate BZ_TUNE_BASE={spec:?}");

    // ---- curated, Train split only (holdout stays out of the report) ----
    let cur_base = per_item(
        &bench.fixture.entries,
        &bench.curated_cache,
        bench.assets,
        &base,
    );
    let cur_cand = per_item(
        &bench.fixture.entries,
        &bench.curated_cache,
        bench.assets,
        &cand,
    );
    report("curated train", &cur_base, &cur_cand, true);

    // ---- mechanical (all Train; target_depth = 1 → #1 is pass) ----
    let mech_base = per_item(&bench.mech_entries, &bench.mech_cache, bench.assets, &base);
    let mech_cand = per_item(&bench.mech_entries, &bench.mech_cache, bench.assets, &cand);
    report("mechanical", &mech_base, &mech_cand, false);
}

/// Print every item whose rank changed between `base` and `cand`, sorted by
/// gain delta, plus the gross churn headline. `train_only` filters to the Train
/// split (curated has holdout; mechanical does not).
fn report(label: &str, base: &[ItemRes], cand: &[ItemRes], train_only: bool) {
    let c = churn(base, cand, train_only);
    let n_items = base
        .iter()
        .filter(|b| !train_only || b.split == Split::Train)
        .count();
    eprintln!(
        "\n[{label}] {n_items} items, {} moved rank; depth-crossings: \
         {} fail→pass, {} pass→fail; Σgain Δ={:+.3} (flat per-item, not category-normalized)",
        c.moved, c.up, c.down, c.net_gain,
    );
    let mut movers: Vec<(&ItemRes, &ItemRes, f32)> = base
        .iter()
        .zip(cand)
        .filter(|(b, _)| !train_only || b.split == Split::Train)
        .filter(|(b, a)| b.rank != a.rank)
        .map(|(b, a)| (b, a, a.gain - b.gain))
        .collect();
    movers.sort_by(|x, y| y.2.abs().total_cmp(&x.2.abs()));
    for (b, a, dg) in movers.iter().take(40) {
        let cross = if !b.passed() && a.passed() {
            " ⬆PASS"
        } else if b.passed() && !a.passed() {
            " ⬇FAIL"
        } else {
            ""
        };
        eprintln!(
            "  {dg:+.3}  rank {:>3}→{:<3}  {}/{}  q={:?}{cross}",
            b.rank, a.rank, b.cat, b.id, a.query,
        );
    }
    if movers.len() > 40 {
        eprintln!("  … {} more movers", movers.len() - 40);
    }
}
