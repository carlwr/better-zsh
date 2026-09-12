// The corpus-derived "mechanical" sentence set (NLP.md §"Eval architecture",
// layer B): every entry is generated from the corpus, so the set is large
// and free, unlike the hand-curated fixture. Two registers:
//
// - terse decorated forms — the lookup contract's decorated phrasings
//   (`option AUTO_CD`, `setopt builtin`, …), reused verbatim;
// - NL-question forms — per-category question templates over each record's
//   display form (`nlQuestions`); `special_param` also gets a `$`-prefixed
//   variant ("what is the $# parameter").
//
// The entries fold into the same metric as the curated fixture (`gain`,
// `score`, `BETA`); the combined total blends curated `train` and
// mechanical via `LAMBDA`. Two diagnostics ride along — reported, never
// gated, never tuned toward: the per-category count of entries whose record
// did not rank #1, and the id-shape slices.

import type { DocCorpus } from '@carlwr/zsh-core';
import { type DocCategory, docCategories, docDisplay, idOf } from '@carlwr/zsh-core/taxonomy';

import { buildLookupContract } from '../contract';
import { embedUnique } from '../embedder-node';
import type { ResolverHitSource } from '../oracle';
import type { EvalAssets } from './assets';
import { type EvalResult, evalResult } from './metric';
import { type HardCheckTemplate, hardCheckTemplates } from './qa-score';
import {
  countPerCategory,
  fixed3,
  type GradedItem,
  gradeEntries,
  type RankAssets,
  voteOf
} from './sentence';
import type { SentenceEntry } from './sentence-fixture';

const f = Math.fround;

/** Curated/mechanical blend weight: `total = LAMBDA·curated_train + (1 − LAMBDA)·mechanical`. */
export const LAMBDA = 0.5;

/** The blend, in f32; one definition for every caller. */
export const combinedTotal = (curatedTrain: number, mechanicalTotal: number): number =>
  f(f(LAMBDA * curatedTrain) + f(f(1 - LAMBDA) * mechanicalTotal));

/** Every item at unit depth and weight, train split: a mechanical entry
 * demands a true top-1 surface and contributes equally. */
export const TARGET_DEPTH = 1;

// The QA hard-check questions plus a `$`-prefixed `special_param` form and a
// `zle_widget` form the harness lacks. The `$NAME` form is what users
// actually type; neither the resolver (it only strips `IDENT[subscript]`)
// nor the lookup map (bare names) reaches it, so unlike a bare form it is
// never hard-promoted — genuine ranker signal for the `$NAME`-in-a-sentence
// path.
const nlQuestionExtras: Partial<Record<DocCategory, HardCheckTemplate>> = {
  special_param: (d) => `what is the $${d} parameter`,
  zle_widget: (d) => `what does the ${d} widget do`
};

/** The NL questions over a record's display form; none for a category outside the templated ones. */
export function nlQuestions(category: DocCategory, display: string): string[] {
  return [hardCheckTemplates[category], nlQuestionExtras[category]].flatMap((t) => (t ? [t(display)] : []));
}

const mechanicalEntry = (query: string, category: string, id: string): SentenceEntry => ({
  query,
  want: [{ category, id, targetDepth: TARGET_DEPTH, weight: 1 }],
  split: 'train'
});

/**
 * The full mechanical set: the contract's decorated phrasings in contract
 * order, each wanting the record it was generated from (not the contract's
 * OR-set), then the NL questions per record in corpus order.
 */
export function buildMechanical(corpus: DocCorpus): SentenceEntry[] {
  const decorated = buildLookupContract(corpus)
    .entries.filter((e) => e.phrasingKind !== 'bare')
    .map((e) => mechanicalEntry(e.query, e.record.category, e.record.id));
  const questions = docCategories.flatMap((cat) =>
    [...corpus[cat].values()].flatMap((rec) => {
      const id = idOf(cat, rec) as string;
      if (id === '') return [];
      return nlQuestions(cat, docDisplay(cat, rec)).map((q) => mechanicalEntry(q, cat, id));
    })
  );
  return [...decorated, ...questions];
}

export interface Slice {
  label: string;
  pred: (id: string) => boolean;
}

/** Unicode alphanumeric: the `Alphabetic` property or a number category. */
const isAlphanumeric = (c: string): boolean => /[\p{Alphabetic}\p{N}]/u.test(c);
const idLength = (n: number): Slice => ({ label: `id length ${n}`, pred: (id) => [...id].length === n });

/**
 * Cross-cutting "hard slice" buckets over the expected record's id, cutting
 * across categories: short and punctuation-only ids are where embedding
 * retrieval is weakest, yet they hide inside the category means. Lengths
 * count code points. Slices overlap by design (a 1-char punctuation id lands
 * in both `id length 1` and `punctuation-only`).
 */
export const SLICES: readonly Slice[] = [
  ...[1, 2, 3, 4].map(idLength),
  { label: 'punctuation-only', pred: (id) => id !== '' && [...id].every((c) => !isAlphanumeric(c)) }
];

/** One slice's stats. `meanGain` is a flat per-item mean (a slice is a
 * property, not a category); `fails` counts items not ranked #1. */
export interface SliceStat {
  label: string;
  n: number;
  fails: number;
  meanGain: number;
}

export interface MechanicalEval extends EvalResult {
  /** Per category: entries whose record did not rank #1. Reported, never gated. */
  violations: Map<string, number>;
  slices: SliceStat[];
}

const notTop1 = (g: GradedItem): boolean => g.rank !== 1;

function sliceStats(graded: readonly GradedItem[]): SliceStat[] {
  return SLICES.map(({ label, pred }) => {
    const members = graded.filter((g) => pred(g.item.id));
    let sum = 0;
    for (const g of members) sum = f(sum + g.gain);
    return {
      label,
      n: members.length,
      fails: members.filter(notTop1).length,
      meanGain: members.length > 0 ? f(sum / f(members.length)) : 0
    };
  });
}

/** Rank and grade the pre-built entries against an embedded query cache, plus the diagnostics. */
export function evalMechanicalCached(
  entries: readonly SentenceEntry[],
  vecs: ReadonlyMap<string, Float32Array>,
  assets: RankAssets,
  resolverHit: ResolverHitSource
): MechanicalEval {
  const graded = gradeEntries(entries, vecs, assets, resolverHit);
  return {
    ...evalResult(graded.map(voteOf), entries.length, countPerCategory(graded)),
    violations: countPerCategory(graded.filter(notTop1)),
    slices: sliceStats(graded)
  };
}

/** Embed every distinct query once, then `evalMechanicalCached`. */
export async function evalMechanical(
  entries: readonly SentenceEntry[],
  assets: EvalAssets,
  resolverHit: ResolverHitSource
): Promise<MechanicalEval> {
  const queries = entries.map((e) => e.query);
  const vecs = await embedUnique(assets.embedder, queries, assets.rules);
  return evalMechanicalCached(entries, vecs, assets, resolverHit);
}

/** The component report: the total and, per category, the score with its
 * item count and #1-violation count. */
export function renderMechanical(r: MechanicalEval): string {
  const head = `[mechanical] total=${fixed3(r.all.total)}  (${r.nEntries} entries)\n`;
  const rows = [...r.all.perCategory].map(
    ([cat, s]) =>
      `  ${cat.padEnd(20)} ${fixed3(s)}  (n=${r.perCategoryN.get(cat) ?? 0}, #1-violations=${r.violations.get(cat) ?? 0})\n`
  );
  return head + rows.join('');
}

/** The blend line, after `renderMechanical` in the report. */
export const renderCombined = (curatedTrain: number, mechanicalTotal: number): string =>
  `[combined] curated_train=${fixed3(curatedTrain)}  mechanical=${fixed3(mechanicalTotal)}  λ=${LAMBDA}  total=${fixed3(combinedTotal(curatedTrain, mechanicalTotal))}\n`;
