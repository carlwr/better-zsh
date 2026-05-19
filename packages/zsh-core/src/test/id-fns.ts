import { mkDocumented, mkObserved } from "../docs/brands"
import type { DocCorpus } from "../docs/corpus"
import { type DocCategory, docCategories } from "../docs/taxonomy"
import type { Documented, Observed } from "../docs/types"

export const mkDocumented_ =
  <K extends DocCategory>(cat: K) =>
  (raw: string): Documented<K> =>
    mkDocumented(cat, raw)

export const mkObserved_ =
  <K extends DocCategory>(cat: K) =>
  (raw: string): Observed<K> =>
    mkObserved(cat, raw)

/**
 * Build a `DocCorpus` whose maps are all empty, then merge the given
 * per-category overrides. Single cast site for tests that need a partial
 * fixture corpus.
 */
export function emptyCorpus(overrides: Partial<DocCorpus> = {}): DocCorpus {
  const base = Object.fromEntries(
    docCategories.map(cat => [cat, new Map()]),
  ) as unknown as DocCorpus
  return { ...base, ...overrides }
}
