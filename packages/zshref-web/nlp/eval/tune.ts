// The tuning dashboard: every rank-time signal the manual tuning loop
// watches, in one report — the curated sentence split scores, the sanity
// invariants, the bare contract, the mechanical component and the combined
// blend, the churn of a candidate tuning against the committed one, the
// embedder-vs-boosts ablation, the per-category and hard-slice tables, and
// the held-out QA score as an overfit watch. Every number comes from the
// same eval functions the tests use, so the dashboard cannot drift from
// them. Ported from zshref-rs/src/nlp/tune.rs; the QA row is computed
// in-process (nlp/eval/qa-score.ts) over the dashboard's tuning rather than
// read from the harness driving the committed binary.
//
// Tiers: `fast` skips the mechanical layer and the QA (both embed thousands
// of queries) — the Rust debug-build tier — and renders their rows as
// skipped; `cap` keeps every layer but cuts each input to its first entries,
// so the reporter smoke runs the whole path in seconds.

import type { Tuning } from '../../src/lib/ranker/types';
import { byteOrder } from '../byte-order';
import { type BareEval, buildLookupContract, evalBare } from '../contract';
import { DIMS, embedUnique } from '../embedder-node';
import { buildSanityFixture, renderSanity, type SanityFixture } from '../fixtures';
import type { ResolverHitSource } from '../oracle';
import type { EvalAssets } from './assets';
import { type Churn, churn, perItem } from './diff';
import { rustFixed, signed } from './format';
import {
  buildMechanical,
  combinedTotal,
  evalMechanicalCached,
  LAMBDA,
  type MechanicalEval,
  type SliceStat
} from './mechanical';
import type { EvalResult } from './metric';
import { loadQaCorpus } from './qa-corpus';
import { hardChecks, scoreHardChecks, scoreQaCorpus, summaryJson } from './qa-score';
import { evalSentenceCached, fixed3, type RankAssets } from './sentence';
import { loadSentenceFixture } from './sentence-fixture';

/** `assets` ranking with `tuning` in place of the loaded one. */
export const withTuning = <A extends RankAssets>(assets: A, tuning: Tuning): A => ({
  ...assets,
  rules: { ...assets.rules, tuning }
});

/**
 * All-zero replacement for an embedded query cache (same keys, zero
 * vectors): `dot(0, v) = 0`, so every semantic view scores 0 and the
 * ranking falls to the boosts and the lookup-map promote alone.
 */
export function zeroedCache(vecs: ReadonlyMap<string, Float32Array>): Map<string, Float32Array> {
  return new Map([...vecs.keys()].map((k) => [k, new Float32Array(DIMS)]));
}

/**
 * The tuning with every lexical-boost term and the rarity penalty zeroed,
 * leaving the semantic channel (and the promote) alone. Bypasses the
 * load-time range checks, as the sweep's overrides do.
 */
export function zeroBoosts(t: Tuning): Tuning {
  return {
    ...t,
    boosts: {
      ...t.boosts,
      category: 0,
      exact_word_increment: 0,
      resolver_increment: 0,
      word_overlap: { ...t.boosts.word_overlap, scale: 0 }
    },
    penalties: { ...t.penalties, category_rarity_max: 0 }
  };
}

/** A metric under the live tuning, with the embedder off, with the boosts off. */
export type Ablation = [full: number, noEmbed: number, noBoost: number];

/** Embedder-vs-boosts decomposition; the lookup-map promote stays on in every column. */
export interface Components {
  train: Ablation;
  holdout: Ablation;
  /** Null in the fast tier. */
  mech: Ablation | null;
}

export interface QaSummary {
  avgPercent: number;
  hardPercent: number;
}

export interface Dashboard {
  sentence: EvalResult;
  /** Curated `train` total — one half of the combined blend. */
  curatedTrain: number;
  sanity: SanityFixture;
  bare: BareEval;
  /** Null in the fast tier. */
  mechanical: MechanicalEval | null;
  /** Null in the fast tier. */
  qa: QaSummary | null;
  components: Components;
  /** Churn of the candidate vs the committed tuning; null without a candidate. Mechanical: full tier only. */
  churn: { curated: Churn; mechanical: Churn | null } | null;
}

export interface DashboardOptions {
  resolverHit: ResolverHitSource;
  /** `tuning` is a candidate (the committed one with overrides): diff it against `assets.rules.tuning`. */
  candidate: boolean;
  /** Skip the mechanical layer and the QA. */
  fast?: boolean;
  /**
   * Smoke tier: every eval input cut to its first `cap` entries — the
   * curated fixture, the mechanical set, the hard checks, the QA corpus.
   * The report then has the dashboard's shape and none of its meaning.
   */
  cap?: number;
}

/** The full tier's extra signals: the mechanical layer, its ablation and churn, and the QA. */
interface FullTier {
  mechanical: MechanicalEval;
  mech: Ablation;
  churn: Churn | null;
  qa: QaSummary;
}

async function fullTier(
  assets: EvalAssets,
  live: EvalAssets,
  noBoosts: EvalAssets,
  { resolverHit, candidate, cap }: DashboardOptions
): Promise<FullTier> {
  // `slice(0, undefined)` is the whole array: no cap, no cut.
  const entries = buildMechanical(assets.corpus).slice(0, cap);
  const vecs = await embedUnique(assets.embedder, entries.map((e) => e.query), assets.rules);
  const qa = await loadQaCorpus();
  const mechanical = evalMechanicalCached(entries, vecs, live, resolverHit);
  return {
    mechanical,
    mech: [
      mechanical.all.total,
      evalMechanicalCached(entries, zeroedCache(vecs), live, resolverHit).all.total,
      evalMechanicalCached(entries, vecs, noBoosts, resolverHit).all.total
    ],
    churn: candidate
      ? churn(perItem(entries, vecs, assets, resolverHit), perItem(entries, vecs, live, resolverHit), false)
      : null,
    qa: summaryJson(
      await scoreHardChecks(hardChecks(assets.corpus).slice(0, cap), live, resolverHit),
      await scoreQaCorpus({ ...qa, entries: qa.entries.slice(0, cap) }, live, resolverHit)
    )
  };
}

/**
 * Every dashboard signal for `tuning`. The curated and (full tier) the
 * mechanical queries are embedded once and re-ranked for the live tuning
 * and its two ablations; the sanity fixture is rebuilt fresh. `assets`
 * carries the committed tuning, the churn baseline.
 */
export async function buildDashboard(assets: EvalAssets, tuning: Tuning, opts: DashboardOptions): Promise<Dashboard> {
  const { resolverHit, candidate, fast = false, cap } = opts;
  const live = withTuning(assets, tuning);
  const noBoosts = withTuning(assets, zeroBoosts(tuning));

  const loaded = await loadSentenceFixture();
  const fixture = { ...loaded, entries: loaded.entries.slice(0, cap) };
  const curVecs = await embedUnique(assets.embedder, fixture.entries.map((e) => e.query), assets.rules);
  const sentence = evalSentenceCached(fixture, curVecs, live, resolverHit);
  const curNoEmbed = evalSentenceCached(fixture, zeroedCache(curVecs), live, resolverHit);
  const curNoBoost = evalSentenceCached(fixture, curVecs, noBoosts, resolverHit);
  const curatedChurn = candidate
    ? churn(
        perItem(fixture.entries, curVecs, assets, resolverHit),
        perItem(fixture.entries, curVecs, live, resolverHit),
        true
      )
    : null;
  const sanity = await buildSanityFixture(live);
  const bare = evalBare(buildLookupContract(assets.corpus), assets.lookup);
  const full = fast ? null : await fullTier(assets, live, noBoosts, opts);

  return {
    sentence,
    curatedTrain: sentence.train.total,
    sanity,
    bare,
    mechanical: full?.mechanical ?? null,
    qa: full?.qa ?? null,
    components: {
      train: [sentence.train.total, curNoEmbed.train.total, curNoBoost.train.total],
      holdout: [sentence.holdout.total, curNoEmbed.holdout.total, curNoBoost.holdout.total],
      mech: full?.mech ?? null
    },
    churn: curatedChurn ? { curated: curatedChurn, mechanical: full?.churn ?? null } : null
  };
}

// --- rendering --------------------------------------------------------------

const FAST_HINT = '(--fast; run `pnpm nlp:tune-dashboard` without it)';

export function renderDashboard(d: Dashboard): string {
  const s = d.sentence;
  const m = d.mechanical;
  const lines = [
    '\n=== nlp tuning dashboard ===',
    `[sentence]  all=${fixed3(s.all.total)}  train=${fixed3(s.train.total)}  holdout=${fixed3(s.holdout.total)}  (${s.nEntries} entries)`,
    renderSanity(d.sanity).trimEnd(),
    `[contract] ${d.bare.bareTotal} bare entries, ${d.bare.failures.length} failures`,
    ...(m
      ? [
          `[mechanical] ${fixed3(m.all.total)}  (${m.nEntries} entries)`,
          `[combined]  λ·train + (1−λ)·mech = ${fixed3(LAMBDA)}·${fixed3(d.curatedTrain)} + ${fixed3(1 - LAMBDA)}·${fixed3(m.all.total)} = ${fixed3(combinedTotal(d.curatedTrain, m.all.total))}`
        ]
      : [`[mechanical] skipped ${FAST_HINT}`]),
    '  holdout = overfit watch; never tune on it.',
    churnBlock(d.churn),
    renderComponents(d.components),
    '\nper category — curated split vs mechanical:',
    '  mech=mechanical  fix=cur.train  hold=cur.holdout  all=cur.both',
    perCategoryTable(s, m).trimEnd(),
    ...(m
      ? [
          '\nhard slices (mechanical; fail = expected record not #1):',
          '  cross-cutting & overlapping (a 1-char punct id is in both)',
          sliceTable(m.slices).trimEnd()
        ]
      : ['\nhard slices: skipped (--fast)']),
    d.qa
      ? `[qa] avg ${rustFixed(Math.fround(d.qa.avgPercent), 1)}%, hard-check score ${rustFixed(Math.fround(d.qa.hardPercent), 1)}% (held-out — never tune on this)`
      : `[qa] skipped ${FAST_HINT}`
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Gross churn of the candidate vs the committed tuning — the signal the
 * headline scores cannot carry: a candidate that flips 100 items and nets
 * +0.005 is churning, not improving.
 */
function churnBlock(c: Dashboard['churn']): string {
  if (!c) return '\nchurn vs committed baseline: no candidate (set BZ_TUNE_BASE=<overrides> to diff)';
  const row = (name: string, x: Churn): string =>
    `  ${name.padEnd(13)}${String(x.moved).padStart(4)} moved │ ${String(x.up).padStart(3)} fail→pass ${String(x.down).padStart(3)} pass→fail │ Σgain Δ ${signed(x.netGain, 3)} (net)`;
  return [
    '\nchurn vs committed baseline (gross counts — a small score Δ hides large churn):',
    row('curated train', c.curated),
    c.mechanical ? row('mechanical', c.mechanical) : '  mechanical   skipped (--fast)'
  ].join('\n');
}

function renderComponents({ train, holdout, mech }: Components): string {
  const row = (name: string, v: Ablation): string =>
    `  ${name.padEnd(11)}${v.map((x) => fixed3(x).padStart(8)).join('')}`;
  return [
    '\ncomponent decomposition (lookup-map ON in all rows):',
    '  −embed = embedder off (boosts only); −boost = boosts off (embedder only)',
    `  ${''.padEnd(11)}${['full', '−embed', '−boost'].map((h) => h.padStart(8)).join('')}`,
    row('cur.train', train),
    row('cur.hold', holdout),
    mech ? row('mechanical', mech) : '  mechanical  skipped (--fast)'
  ].join('\n');
}

/**
 * One row per category (curated ∪ mechanical): the mechanical score beside
 * the curated split scores, then the item counts. `—` = no votes in that
 * source; `·` = the mechanical column in the fast tier.
 */
function perCategoryTable(s: EvalResult, m: MechanicalEval | null): string {
  const cats = [...new Set([...s.all.perCategory.keys(), ...(m?.all.perCategory.keys() ?? [])])].sort(byteOrder);
  const score = (x: ReadonlyMap<string, number>, c: string): string => {
    const v = x.get(c);
    return v === undefined ? '—' : fixed3(v);
  };
  const count = (x: ReadonlyMap<string, number>, c: string): string => String(x.get(c) ?? '—');
  const rows = cats.map((c) => [
    c,
    m ? score(m.all.perCategory, c) : '·',
    score(s.train.perCategory, c),
    score(s.holdout.perCategory, c),
    score(s.all.perCategory, c),
    m ? count(m.perCategoryN, c) : '·',
    count(s.perCategoryN, c)
  ]);
  return boxTable(
    ['category', 'mech', 'fix', 'hold', 'all', 'n:mec', 'n:cur'],
    [false, true, true, true, true, true, true],
    rows
  );
}

const sliceTable = (slices: readonly SliceStat[]): string =>
  boxTable(
    ['id slice', 'score', 'fail/total'],
    [false, true, true],
    slices.map((x) => [x.label, fixed3(x.meanGain), `${x.fails}/${x.n}`])
  );

const charCount = (s: string): number => [...s].length;

/**
 * A Unicode box table; `right` selects right-alignment per column (numbers
 * right, labels left), widths fit the widest cell (in characters, not
 * bytes), one space of padding each side.
 */
export function boxTable(headers: readonly string[], right: readonly boolean[], rows: readonly (readonly string[])[]): string {
  const w = headers.map((h, i) => Math.max(charCount(h), ...rows.map((r) => charCount(r[i] ?? ''))));
  const rule = (l: string, mid: string, r: string): string =>
    `${l}${w.map((wi) => '─'.repeat(wi + 2)).join(mid)}${r}`;
  const row = (cells: readonly string[]): string =>
    `│${cells.map((c, i) => ` ${right[i] ? c.padStart(w[i] ?? 0) : c.padEnd(w[i] ?? 0)} │`).join('')}`;
  return `${[rule('┌', '┬', '┐'), row(headers), rule('├', '┼', '┤'), ...rows.map(row), rule('└', '┴', '┘')].join('\n')}\n`;
}
