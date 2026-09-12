// Per-item ranks and gross churn between two tunings, for the tune
// dashboard (nlp/eval/tune.ts) and the tune diff reporter. The aggregate
// scores are per-category-normalized means: a candidate that flips a
// hundred items can move the headline by under 0.01, and that move is a
// net. This recovers the discrete signal — each item's rank under a
// tuning, and how many items crossed the pass bar each way (never a net).
// Ported from zshref-rs/src/nlp/eval_diff.rs and the `report` of
// tune_sweep.rs.
//
// Holdout hygiene (NLP.md): the mover lines print query strings, so the
// curated report is restricted to the train split (`trainOnly`); the
// mechanical set is all train.

import type { ResolverHitSource } from '../oracle';
import { rustDebugString, signed } from './format';
import type { Split } from './metric';
import { type GradedItem, gradeEntries, type RankAssets } from './sentence';
import type { SentenceEntry } from './sentence-fixture';

const f = Math.fround;

/** One expected item's rank and gain under a tuning, with what a diff needs. */
export interface ItemRes {
  query: string;
  cat: string;
  id: string;
  split: Split;
  rank: number;
  gain: number;
  depth: number;
}

/** A pass = ranked at or above the item's target depth (mechanical: 1; curated default: 3). */
export const passed = (r: ItemRes): boolean => r.rank <= r.depth;

const itemRes = (g: GradedItem): ItemRes => ({
  query: g.entry.query,
  cat: g.item.category,
  id: g.item.id,
  split: g.entry.split,
  rank: g.rank,
  gain: g.gain,
  depth: g.item.targetDepth
});

/**
 * Every item's rank and gain, over the same chain as the evals (rank →
 * promote → own rank). Index-aligned with `entries` flattened over each
 * `want` set, so two calls with different tunings zip 1:1 for `churn`.
 */
export function perItem(
  entries: readonly SentenceEntry[],
  vecs: ReadonlyMap<string, Float32Array>,
  assets: RankAssets,
  resolverHit: ResolverHitSource
): ItemRes[] {
  return gradeEntries(entries, vecs, assets, resolverHit).map(itemRes);
}

/** Gross tallies of `cand` vs `base`; `netGain` is the signed sum they contextualize. */
export interface Churn {
  moved: number;
  up: number;
  down: number;
  netGain: number;
}

const inScope = (r: ItemRes, trainOnly: boolean): boolean => !trainOnly || r.split === 'train';

/** Pairs of `base` and its index-aligned `cand`, restricted to the train split when `trainOnly`. */
function pairs(base: readonly ItemRes[], cand: readonly ItemRes[], trainOnly: boolean): [ItemRes, ItemRes][] {
  if (base.length !== cand.length) throw new Error('per-item results are not index-aligned');
  return base.flatMap((b, i): [ItemRes, ItemRes][] => {
    const a = cand[i];
    return a && inScope(b, trainOnly) ? [[b, a]] : [];
  });
}

/** Items that changed rank, how many crossed the pass bar each way, and the f32 net gain delta. */
export function churn(base: readonly ItemRes[], cand: readonly ItemRes[], trainOnly: boolean): Churn {
  const c: Churn = { moved: 0, up: 0, down: 0, netGain: 0 };
  for (const [b, a] of pairs(base, cand, trainOnly)) {
    if (b.rank !== a.rank) c.moved++;
    c.netGain = f(c.netGain + f(a.gain - b.gain));
    if (!passed(b) && passed(a)) c.up++;
    if (passed(b) && !passed(a)) c.down++;
  }
  return c;
}

const MOVERS_SHOWN = 40;

/**
 * The diff report of one set: the churn headline, then every item whose
 * rank changed, largest |Δgain| first (stable), capped at `MOVERS_SHOWN`.
 */
export function renderDiffReport(
  label: string,
  base: readonly ItemRes[],
  cand: readonly ItemRes[],
  trainOnly: boolean
): string {
  const c = churn(base, cand, trainOnly);
  const nItems = base.filter((b) => inScope(b, trainOnly)).length;
  const movers = pairs(base, cand, trainOnly)
    .filter(([b, a]) => b.rank !== a.rank)
    .map(([b, a]) => ({ b, a, dg: f(a.gain - b.gain) }))
    .sort((x, y) => Math.abs(y.dg) - Math.abs(x.dg));
  const lines = [
    `\n[${label}] ${nItems} items, ${c.moved} moved rank; depth-crossings: ${c.up} fail→pass, ${c.down} pass→fail; Σgain Δ=${signed(c.netGain, 3)} (flat per-item, not category-normalized)`,
    ...movers.slice(0, MOVERS_SHOWN).map(({ b, a, dg }) => {
      const cross = !passed(b) && passed(a) ? ' ⬆PASS' : passed(b) && !passed(a) ? ' ⬇FAIL' : '';
      return `  ${signed(dg, 3)}  rank ${String(b.rank).padStart(3)}→${String(a.rank).padEnd(3)}  ${b.cat}/${b.id}  q=${rustDebugString(a.query)}${cross}`;
    }),
    ...(movers.length > MOVERS_SHOWN ? [`  … ${movers.length - MOVERS_SHOWN} more movers`] : [])
  ];
  return `${lines.join('\n')}\n`;
}
