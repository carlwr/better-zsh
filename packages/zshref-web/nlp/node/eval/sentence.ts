// The curated sentence eval (NLP.md §"Eval architecture", layer B): every
// fixture entry ranked as search does it — `rank`, then the lookup-map
// promote — and each expected item graded on its own rank. `gradeEntries`
// is the reference grading; the tuning bench regrades cached score inputs
// instead, pinned equal to it.

import { promoteToTop } from "../../core/lookup-map"
import { rank } from "../../core/rank"
import { embedUnique } from "../embedder-node"
import type { EvalAssets } from "./assets"
import { BETA, type EvalResult, evalResult, gain, type Vote } from "./metric"
import type {
  SentenceEntry,
  SentenceFixture,
  SentenceItem,
} from "./sentence-fixture"

/** What ranking needs; the embedder only fills the cache. */
export type RankAssets = Pick<EvalAssets, "index" | "rules" | "lookup">

/** One expected item graded: its own 1-based rank after the promote, and the gain at it. */
export interface GradedItem {
  entry: SentenceEntry
  item: SentenceItem
  rank: number
  gain: number
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
): GradedItem[] {
  return entries.flatMap(entry => {
    const vec = vecs.get(entry.query)
    if (!vec) throw new Error("fixture query missing from the vector cache")
    const ranked = rank(entry.query, vec, null, assets.index, assets.rules)
    promoteToTop(ranked, assets.lookup.lookup(entry.query))
    return entry.want.map((item): GradedItem => {
      const pos = ranked.findIndex(
        m => m.rec.category === item.category && m.rec.id === item.id,
      )
      const itemRank = pos === -1 ? ranked.length + 1 : pos + 1
      return {
        entry,
        item,
        rank: itemRank,
        gain: gain(itemRank, item.targetDepth, BETA),
      }
    })
  })
}

/** The vote of a graded item. */
export const voteOf = (g: GradedItem): Vote => ({
  category: g.item.category,
  weight: g.item.weight,
  gain: g.gain,
  split: g.entry.split,
})

/** Items per category, in first-seen order. */
export function countPerCategory(
  graded: readonly GradedItem[],
): Map<string, number> {
  const n = new Map<string, number>()
  for (const { item } of graded)
    n.set(item.category, (n.get(item.category) ?? 0) + 1)
  return n
}

/** Every distinct entry query embedded once, by query. */
export const embedEntries = (
  entries: readonly SentenceEntry[],
  assets: EvalAssets,
): Promise<Map<string, Float32Array>> =>
  embedUnique(
    assets.embedder,
    entries.map(e => e.query),
    assets.rules,
  )

/** The eval of already-graded items from `nEntries` entries. */
export const evalGraded = (
  graded: readonly GradedItem[],
  nEntries: number,
): EvalResult =>
  evalResult(graded.map(voteOf), nEntries, countPerCategory(graded))

export const evalSentenceCached = (
  entries: readonly SentenceEntry[],
  vecs: ReadonlyMap<string, Float32Array>,
  assets: RankAssets,
): EvalResult => evalGraded(gradeEntries(entries, vecs, assets), entries.length)

/** `evalSentenceCached` over freshly embedded queries. */
export async function evalSentence(
  { entries }: SentenceFixture,
  assets: EvalAssets,
): Promise<EvalResult> {
  return evalSentenceCached(
    entries,
    await embedEntries(entries, assets),
    assets,
  )
}

/** The report: aggregates only, holdout as a labelled overfit-watch. One
 * definition, shared by the reporter, its test and the dashboard. */
export function renderSentence(r: EvalResult): string {
  const head = `[sentence-fixture] total=${r.all.total.toFixed(3)}  train=${r.train.total.toFixed(3)}  holdout=${r.holdout.total.toFixed(3)} (overfit-watch — never tune on this)  (${r.nEntries} entries)\n`
  const rows = [...r.all.perCategory].map(
    ([cat, s]) =>
      `  ${cat.padEnd(20)} ${s.toFixed(3)}  (n=${r.perCategoryN.get(cat) ?? 0})\n`,
  )
  return head + rows.join("")
}
