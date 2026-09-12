// The curated sentence eval (NLP.md §"Eval architecture", layer B): every
// fixture entry ranked as search does it — resolver hit, `rank`, then the
// lookup-map promote — and each expected item graded on its own rank.
// Embedding is tuning-independent, so `evalSentenceCached` takes the query
// vectors as a cache: a tuning sweep embeds once and re-ranks per variant.
// Ported from `eval`/`eval_cached`/`render` in zshref-rs/src/nlp/
// sentence_fixture.rs.

import { promoteToTop } from '../../src/lib/ranker/lookup-map';
import { rank } from '../../src/lib/ranker/rank';
import { embedUnique } from '../embedder-node';
import type { ResolverHitSource } from '../oracle';
import type { EvalAssets } from './assets';
import { rustFixed } from './format';
import { BETA, type EvalResult, evalResult, gain, type Vote } from './metric';
import type { SentenceEntry, SentenceFixture, SentenceItem } from './sentence-fixture';

/** What ranking needs; the embedder only fills the cache. */
export type RankAssets = Pick<EvalAssets, 'index' | 'rules' | 'lookup'>;

/** One expected item graded: its own 1-based rank after the promote, and the gain at it. */
export interface GradedItem {
  entry: SentenceEntry;
  item: SentenceItem;
  rank: number;
  gain: number;
}

/**
 * Rank every entry as search does it and grade each expected item on its
 * own rank; an item the index lacks (every corpus record is ranked, so it
 * should not happen) counts as just past the end. The one grading loop of
 * the curated and the mechanical eval.
 */
export function gradeEntries(
  entries: readonly SentenceEntry[],
  vecs: ReadonlyMap<string, Float32Array>,
  assets: RankAssets,
  resolverHit: ResolverHitSource
): GradedItem[] {
  return entries.flatMap((entry) => {
    const vec = vecs.get(entry.query);
    if (!vec) throw new Error('fixture query missing from the vector cache');
    const ranked = rank(entry.query, vec, resolverHit(entry.query), null, assets.index, assets.rules);
    promoteToTop(ranked, assets.lookup.lookup(entry.query));
    return entry.want.map((item): GradedItem => {
      const pos = ranked.findIndex((m) => m.rec.category === item.category && m.rec.id === item.id);
      const itemRank = pos === -1 ? ranked.length + 1 : pos + 1;
      return { entry, item, rank: itemRank, gain: gain(itemRank, item.targetDepth, BETA) };
    });
  });
}

/** The vote of a graded item. */
export const voteOf = (g: GradedItem): Vote => ({
  category: g.item.category,
  weight: g.item.weight,
  gain: g.gain,
  split: g.entry.split
});

/** Items per category, in first-seen order. */
export function countPerCategory(graded: readonly GradedItem[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const { item } of graded) n.set(item.category, (n.get(item.category) ?? 0) + 1);
  return n;
}

export function evalSentenceCached(
  fixture: SentenceFixture,
  vecs: ReadonlyMap<string, Float32Array>,
  assets: RankAssets,
  resolverHit: ResolverHitSource
): EvalResult {
  const graded = gradeEntries(fixture.entries, vecs, assets, resolverHit);
  return evalResult(graded.map(voteOf), fixture.entries.length, countPerCategory(graded));
}

/** Embed every distinct fixture query once, then `evalSentenceCached`. */
export async function evalSentence(
  fixture: SentenceFixture,
  assets: EvalAssets,
  resolverHit: ResolverHitSource
): Promise<EvalResult> {
  const queries = fixture.entries.map((e) => e.query);
  const vecs = await embedUnique(assets.embedder, queries, assets.rules);
  return evalSentenceCached(fixture, vecs, assets, resolverHit);
}

/** `{:.3}`, as every report prints a score. */
export const fixed3 = (x: number): string => rustFixed(x, 3);

/** The report: aggregates only, holdout as a labelled overfit-watch. One
 * definition, shared by the reporter, its test and the dashboard. */
export function renderSentence(r: EvalResult): string {
  const head = `[sentence-fixture] total=${fixed3(r.all.total)}  train=${fixed3(r.train.total)}  holdout=${fixed3(r.holdout.total)} (overfit-watch — never tune on this)  (${r.nEntries} entries)\n`;
  const rows = [...r.all.perCategory].map(
    ([cat, s]) => `  ${cat.padEnd(20)} ${fixed3(s)}  (n=${r.perCategoryN.get(cat) ?? 0})\n`
  );
  return head + rows.join('');
}
