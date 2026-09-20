import { identity, mkDocumented } from "../docs/brands"
import type { DocCorpus } from "../docs/corpus"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
} from "../docs/taxonomy"
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
 * `DocCorpus` populated only with ids in one category; each record carries
 * just its identity fields — for resolver tests that exercise membership,
 * not record content. The single cast site is here.
 */
export function membershipCorpus<K extends DocCategory>(
  cat: K,
  rawIds: readonly string[],
): DocCorpus {
  const entries = rawIds.map(raw => {
    const base = identity(cat, raw)
    return [base.id, base as unknown as DocRecordMap[K]] as const
  })
  return emptyCorpus({ [cat]: new Map(entries) } as Partial<DocCorpus>)
}
