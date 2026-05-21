import { mkDocumented } from "../docs/brands"
import type { DocCorpus } from "../docs/corpus"
import { type DocCategory, docCategories } from "../docs/taxonomy"
import type { Documented } from "../docs/types"

export const mkDocumented_ =
  <K extends DocCategory>(cat: K) =>
  (raw: string): Documented<K> =>
    mkDocumented(cat, raw)

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

/**
 * `DocCorpus` populated only with id keys in one category. Values are absent
 * — for resolver tests that only exercise `Map.has` (membership). The single
 * cast site is here.
 */
export function membershipCorpus<K extends DocCategory>(
  cat: K,
  rawIds: readonly string[],
): DocCorpus {
  const entries = rawIds.map(
    raw => [mkDocumented(cat, raw), undefined] as const,
  )
  return emptyCorpus({ [cat]: new Map(entries) } as Partial<DocCorpus>)
}
