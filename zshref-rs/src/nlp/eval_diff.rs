// Per-item rank extraction + gross churn counting, shared by the tuning
// dashboard (`tune.rs`) and the sweep diff (`tune_sweep.rs`).
//
// The aggregate scores are per-category-normalized continuous means, so a
// candidate that flips a hundred items can still move the headline by <0.01,
// and that move is a *net* — it says nothing about how many items churned or in
// which direction. This module recovers the discrete signal the scores hide:
// each item's rank under a tuning, and the gross fail→pass / pass→fail counts
// between two tunings (never a net). Test-only.

#![cfg(test)]

use crate::nlp::fixtures::Assets;
use crate::nlp::lookup_map::{self, LookupIndex};
use crate::nlp::rank;
use crate::nlp::rules::Tuning;
use crate::nlp::search;
use crate::nlp::sentence_fixture::{g, SentenceEntry, Split, BETA};
use std::collections::HashMap;

/// One scored item's rank + gain under a given tuning, carrying the fields
/// needed to (a) diff two tunings item-by-item and (b) rebuild the aggregate
/// scores without a second ranking pass.
pub(crate) struct ItemRes {
    pub query: String,
    pub cat: String,
    pub id: String,
    pub split: Split,
    pub rank: usize,
    pub gain: f32,
    pub depth: f32,
}

impl ItemRes {
    /// A "pass" = ranked at or above the item's target depth. Mechanical depth
    /// is 1, so there a pass is exactly a top-1; curated depth defaults to 3.
    pub fn passed(&self) -> bool {
        (self.rank as f32) <= self.depth
    }
}

/// Per-item rank + gain for every item in `entries`, mirroring the eval path
/// exactly (rank → lookup-map hard-promote → own 1-based rank). The output is
/// index-aligned with `entries` flattened over each `expected_set`, so two
/// calls with different tunings zip 1:1 for [`churn`].
pub(crate) fn per_item(
    entries: &[SentenceEntry],
    cache: &HashMap<String, Vec<f32>>,
    assets: &Assets,
    tuning: &Tuning,
) -> Vec<ItemRes> {
    let map_idx = LookupIndex::from_map(lookup_map::build(&assets.corpus));
    let mut out = Vec::new();
    for e in entries {
        let qvec = cache.get(e.query.as_str()).expect("cached vector");
        let resolver_hit = search::resolver_key(&e.query, None, &assets.corpus);
        let mut ranked = rank::rank(
            &e.query,
            qvec,
            resolver_hit.as_ref(),
            None,
            &assets.index,
            tuning,
        );
        if let Some((hc, hi)) = map_idx.lookup(&e.query) {
            search::promote_to_top(&mut ranked, hc, hi);
        }
        for item in &e.expected_set {
            let rank_pos = ranked
                .iter()
                .position(|m| m.rec.category == item.category && m.rec.id == item.id)
                .map(|p| p + 1)
                .unwrap_or(ranked.len() + 1);
            let depth = item.effective_depth();
            out.push(ItemRes {
                query: e.query.clone(),
                cat: item.category.clone(),
                id: item.id.clone(),
                split: e.split(),
                rank: rank_pos,
                gain: g(rank_pos, depth, BETA),
                depth,
            });
        }
    }
    out
}

/// Gross churn of `cand` vs an index-aligned `base`. `moved` is how many items
/// changed rank at all; `up`/`down` are how many crossed the pass bar each way.
/// All three are independent gross tallies — never a net. `net_gain` is the
/// (signed, net) aggregate-gain delta the counts exist to contextualize: a
/// large `moved` behind a near-zero `net_gain` is the "100 flipped, net 10"
/// case the scoreboard otherwise buries.
pub(crate) struct Churn {
    pub moved: usize,
    pub up: usize,
    pub down: usize,
    pub net_gain: f32,
}

/// Count [`Churn`] of `cand` vs `base`, optionally restricted to the Train
/// split (curated carries a holdout split; mechanical is all Train).
pub(crate) fn churn(base: &[ItemRes], cand: &[ItemRes], train_only: bool) -> Churn {
    let mut c = Churn {
        moved: 0,
        up: 0,
        down: 0,
        net_gain: 0.0,
    };
    for (b, a) in base.iter().zip(cand) {
        if train_only && b.split != Split::Train {
            continue;
        }
        if b.rank != a.rank {
            c.moved += 1;
        }
        c.net_gain += a.gain - b.gain;
        if !b.passed() && a.passed() {
            c.up += 1;
        }
        if b.passed() && !a.passed() {
            c.down += 1;
        }
    }
    c
}
