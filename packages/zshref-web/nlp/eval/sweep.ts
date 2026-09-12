// One-knob-at-a-time rank-time tuning sweep, and the `BZ_TUNE_BASE`
// override syntax it shares with the dashboard and the diff. Rank-time
// knobs never re-embed, so the curated and mechanical queries are embedded
// once (`loadBench`) and re-ranked per variant. The objective is the
// dashboard's combined blend; `holdout` is printed as the overfit watch,
// never optimized. The greedy loop: sweep, fold the best row into
// `BZ_TUNE_BASE`, repeat (one knob at a time misses interactions). Ported
// from zshref-rs/src/nlp/tune_sweep.rs.

import type { Tuning } from '../../src/lib/ranker/types';
import { embedUnique } from '../embedder-node';
import type { ResolverHitSource } from '../oracle';
import type { EvalAssets } from './assets';
import { type ItemRes, perItem, renderDiffReport } from './diff';
import { rustDebugString, rustFixed, signed } from './format';
import { buildMechanical, combinedTotal, evalMechanicalCached } from './mechanical';
import { evalSentenceCached } from './sentence';
import { loadSentenceFixture, type SentenceEntry, type SentenceFixture } from './sentence-fixture';
import { withTuning } from './tune';

const f = Math.fround;

type KnobKind = 'f32' | 'usize';

interface Knob {
  kind: KnobKind;
  /** The sweep's points, each replacing the base value. */
  points: readonly number[];
  /** Sets the knob on a private copy of the tuning. */
  set: (t: Tuning, v: number) => void;
}

const knob = (kind: KnobKind, points: readonly number[], set: Knob['set']): Knob => ({ kind, points, set });
const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

/** The rank-time knobs by `BZ_TUNE_BASE` key, in sweep order; each names one `tuning.yaml` field. */
export const KNOBS = {
  body: knob('f32', [0.55, 0.6, 0.65, 0.7, 0.75, 0.8], (t, v) => {
    t.semantic_weights.body = v;
  }),
  structured: knob('f32', [0.05, 0.1, 0.15, 0.2, 0.25, 0.3], (t, v) => {
    t.semantic_weights.structured = v;
  }),
  sb_strength: knob('f32', [0, 0.06, 0.12, 0.18, 0.24, 0.3], (t, v) => {
    t.semantic_weights.short_body.strength = v;
  }),
  sb_length: knob('f32', [8, 16, 24, 32, 48, 64], (t, v) => {
    t.semantic_weights.short_body.length_scale = v;
  }),
  cat: knob('f32', [0, 0.01, 0.02, 0.04, 0.06, 0.1], (t, v) => {
    t.boosts.category = v;
  }),
  exact_inc: knob('f32', [0, 0.02, 0.04, 0.06, 0.08, 0.12], (t, v) => {
    t.boosts.exact_word_increment = v;
  }),
  resolver_inc: knob('f32', [0, 0.02, 0.06, 0.1, 0.16, 0.24], (t, v) => {
    t.boosts.resolver_increment = v;
  }),
  wo_scale: knob('f32', [0.1, 0.2, 0.3, 0.4, 0.5], (t, v) => {
    t.boosts.word_overlap.scale = v;
  }),
  wo_halfsat: knob('f32', [1, 2, 4, 6, 10, 16], (t, v) => {
    t.boosts.word_overlap.half_sat = v;
  }),
  rarity: knob('f32', [0, 0.01, 0.03, 0.06, 0.1, 0.16], (t, v) => {
    t.penalties.category_rarity_max = v;
  }),
  disc_len: knob('usize', range(2, 6), (t, v) => {
    t.lexical.min_discriminating_word_len = v;
  }),
  sig_len: knob('usize', range(1, 4), (t, v) => {
    t.lexical.min_significant_word_len = v;
  })
} satisfies Record<string, Knob>;
export type KnobKey = keyof typeof KNOBS;
export const KNOB_KEYS = Object.keys(KNOBS) as KnobKey[];

const isKnobKey = (s: string): s is KnobKey => Object.hasOwn(KNOBS, s);

/** The point label: `{:.3}` for an f32 knob, the integer for a usize one. */
export const knobLabel = (kind: KnobKind, v: number): string => (kind === 'f32' ? rustFixed(v, 3) : String(v));

const F32_LITERAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const USIZE_LITERAL = /^\+?\d+$/;

function parseKnobValue(key: KnobKey, kind: KnobKind, raw: string): number {
  const ok = kind === 'f32' ? F32_LITERAL.test(raw) : USIZE_LITERAL.test(raw);
  if (!ok) throw new Error(`BZ_TUNE_BASE ${key}: ${JSON.stringify(raw)} is not a ${kind} value`);
  return kind === 'f32' ? f(Number(raw)) : Number(raw);
}

/** `tuning` with one knob at `v`; the range checks of loading do not apply. */
export function withKnob(tuning: Tuning, key: KnobKey, v: number): Tuning {
  const t = structuredClone(tuning);
  KNOBS[key].set(t, KNOBS[key].kind === 'f32' ? f(v) : v);
  return t;
}

/** One `key=value` override; an unknown key or a malformed value throws, so a typo fails loudly. */
export function applyOverride(tuning: Tuning, key: string, value: string): Tuning {
  if (!isKnobKey(key)) throw new Error(`unknown BZ_TUNE_BASE key: ${JSON.stringify(key)}`);
  return withKnob(tuning, key, parseKnobValue(key, KNOBS[key].kind, value));
}

/**
 * The committed tuning with a `BZ_TUNE_BASE` spec folded in: comma-separated
 * `key=value` pairs, whitespace around either ignored, empty pairs skipped.
 * One definition, so a candidate reads the same in every tool.
 */
export function composedBase(committed: Tuning, spec: string | undefined): Tuning {
  return (spec ?? '')
    .split(',')
    .map((kv) => kv.trim())
    .filter((kv) => kv !== '')
    .reduce((t, kv) => {
      const at = kv.indexOf('=');
      if (at === -1) throw new Error(`BZ_TUNE_BASE entries are key=value, got ${JSON.stringify(kv)}`);
      return applyOverride(t, kv.slice(0, at).trim(), kv.slice(at + 1).trim());
    }, committed);
}

// --- the bench -----------------------------------------------------------------

/** One variant's scores; `combined` is the optimization target. */
export interface Scores {
  train: number;
  holdout: number;
  mechanical: number;
  combined: number;
}

/** Assets plus both query caches, embedded once for every variant. */
export interface Bench {
  assets: EvalAssets;
  fixture: SentenceFixture;
  curatedVecs: Map<string, Float32Array>;
  mechEntries: SentenceEntry[];
  mechVecs: Map<string, Float32Array>;
  resolverHit: ResolverHitSource;
}

/** Embed the curated and the mechanical queries; `progress` gets the one note before the (slow) mechanical embed. */
export async function loadBench(
  assets: EvalAssets,
  resolverHit: ResolverHitSource,
  progress: (line: string) => void = () => {}
): Promise<Bench> {
  const fixture = await loadSentenceFixture();
  const curatedVecs = await embedUnique(assets.embedder, fixture.entries.map((e) => e.query), assets.rules);
  const mechEntries = buildMechanical(assets.corpus);
  progress(`embedding ${fixture.entries.length} curated + ${mechEntries.length} mechanical queries once…`);
  const mechVecs = await embedUnique(assets.embedder, mechEntries.map((e) => e.query), assets.rules);
  return { assets, fixture, curatedVecs, mechEntries, mechVecs, resolverHit };
}

export function scoreBench(bench: Bench, tuning: Tuning): Scores {
  const assets = withTuning(bench.assets, tuning);
  const c = evalSentenceCached(bench.fixture, bench.curatedVecs, assets, bench.resolverHit);
  const m = evalMechanicalCached(bench.mechEntries, bench.mechVecs, assets, bench.resolverHit);
  return {
    train: c.train.total,
    holdout: c.holdout.total,
    mechanical: m.all.total,
    combined: combinedTotal(c.train.total, m.all.total)
  };
}

// --- the sweep -----------------------------------------------------------------

export interface SweepRow {
  label: string;
  scores: Scores;
}

export interface KnobSweep {
  knob: KnobKey;
  rows: SweepRow[];
}

export interface Sweep {
  base: Scores;
  knobs: KnobSweep[];
}

/** One knob: the base with each point in turn. */
export function sweepKnob(bench: Bench, base: Tuning, key: KnobKey): KnobSweep {
  const { kind, points } = KNOBS[key];
  return {
    knob: key,
    rows: points.map((v) => ({ label: knobLabel(kind, v), scores: scoreBench(bench, withKnob(base, key, v)) }))
  };
}

/** Every knob around `base`. The reporter runs the same loop block by block, printing as it goes. */
export const runSweep = (bench: Bench, base: Tuning): Sweep => ({
  base: scoreBench(bench, base),
  knobs: KNOB_KEYS.map((key) => sweepKnob(bench, base, key))
});

/** A row whose combined is within this of the base's is the base row (Rust: `|Δ| < 1e-6`, f32). */
const BASE_EPS = f(1e-6);

/**
 * Per row: ` ◄ best` on the highest combined (the last one on a tie), else
 * ` (base)` where the combined equals the base's, else nothing.
 */
export function sweepMarks(combined: readonly number[], baseCombined: number): string[] {
  const best = combined.reduce((bi, c, i) => (c >= (combined[bi] ?? Number.NEGATIVE_INFINITY) ? i : bi), -1);
  return combined.map((c, i) => (i === best ? ' ◄ best' : Math.abs(f(c - baseCombined)) < BASE_EPS ? ' (base)' : ''));
}

const fixed4 = (x: number): string => rustFixed(x, 4);

export const renderSweepHeader = (base: Scores, spec: string): string =>
  `\n=== tuning sweep (one knob at a time) ===\nbase: combined=${fixed4(base.combined)}  train=${fixed4(base.train)}  holdout=${fixed4(base.holdout)}  mechanical=${fixed4(base.mechanical)}  (BZ_TUNE_BASE=${rustDebugString(spec)})\n`;

export function renderKnobBlock({ knob, rows }: KnobSweep, baseCombined: number): string {
  const marks = sweepMarks(
    rows.map((r) => r.scores.combined),
    baseCombined
  );
  const lines = rows.map(({ label, scores: s }, i) => {
    const delta = f(s.combined - baseCombined);
    return `  ${label.padEnd(10)} comb=${fixed4(s.combined)} Δ=${signed(delta, 4)}  train=${fixed4(s.train)} hold=${fixed4(s.holdout)} mech=${fixed4(s.mechanical)}${marks[i] ?? ''}`;
  });
  return `\n── ${knob} ───────────────────  (base combined=${fixed4(baseCombined)})\n${lines.join('\n')}\n`;
}

export const SWEEP_FOOTER = '\n=== end sweep ===\n';

/** The whole report, as the reporter prints it block by block. */
export function renderSweep(sweep: Sweep, spec: string): string {
  return (
    renderSweepHeader(sweep.base, spec) +
    sweep.knobs.map((k) => renderKnobBlock(k, sweep.base.combined)).join('') +
    SWEEP_FOOTER
  );
}

// --- the diff ------------------------------------------------------------------

/** Both sets under `tuning`, over the bench's caches. */
export const benchItems = (bench: Bench, tuning: Tuning): { curated: ItemRes[]; mechanical: ItemRes[] } => {
  const assets = withTuning(bench.assets, tuning);
  return {
    curated: perItem(bench.fixture.entries, bench.curatedVecs, assets, bench.resolverHit),
    mechanical: perItem(bench.mechEntries, bench.mechVecs, assets, bench.resolverHit)
  };
};

/**
 * Item-level diff of `cand` against `base`: which items change rank and how
 * each move feeds the aggregate — a sweep delta is trustworthy once the
 * items behind it can be named. Curated movers are the train split only;
 * the mechanical set is all train.
 */
export function renderTuneDiff(bench: Bench, base: Tuning, cand: Tuning, spec: string): string {
  const b = benchItems(bench, base);
  const c = benchItems(bench, cand);
  return (
    `\n=== tune diff: base vs candidate ===\ncandidate BZ_TUNE_BASE=${rustDebugString(spec)}\n` +
    renderDiffReport('curated train', b.curated, c.curated, true) +
    renderDiffReport('mechanical', b.mechanical, c.mechanical, false)
  );
}
