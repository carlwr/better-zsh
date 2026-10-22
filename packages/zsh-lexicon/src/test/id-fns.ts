import { identity, mkDocumented } from "../docs/brands"
import type { Lexicon } from "../docs/lexicon"
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
 * Build a `Lexicon` whose maps are all empty, then merge the given
 * per-category overrides. Single cast site for tests that need a partial
 * fixture lexicon.
 */
export function emptyLexicon(overrides: Partial<Lexicon> = {}): Lexicon {
  const base = Object.fromEntries(
    docCategories.map(cat => [cat, new Map()]),
  ) as unknown as Lexicon
  return { ...base, ...overrides }
}

/**
 * `Lexicon` populated only with ids in one category; each record carries
 * just its identity fields — for resolver tests that exercise membership,
 * not record content. The single cast site is here.
 */
export function membershipLexicon<K extends DocCategory>(
  cat: K,
  rawIds: readonly string[],
): Lexicon {
  const entries = rawIds.map(raw => {
    const base = identity(cat, raw)
    return [base.id, base as unknown as DocRecordMap[K]] as const
  })
  return emptyLexicon({ [cat]: new Map(entries) } as Partial<Lexicon>)
}
