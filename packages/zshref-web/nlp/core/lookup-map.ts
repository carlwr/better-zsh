// Static lookup map: canonical surface form → (category, id). Shipped as
// JSON alongside the search index; consumed before the ranker as a hard-promote
// bypass for canonical-identifier queries (e.g. `AUTO_CD`, `_arguments`,
// `NO_AUTO_CD`, `fc`). Close-variant fuzziness stays in the ranker.

import { z } from "zod"

import { type RankedMatch, type ResolverHit, sameRecord } from "./types"

export const LookupEntrySchema = z.object({
  raw: z.string(),
  category: z.string(),
  id: z.string(),
})
export type LookupEntry = z.infer<typeof LookupEntrySchema>

export const LookupMapSchema = z.object({
  version: z.literal(1),
  entries: z.array(LookupEntrySchema),
})
export type LookupMap = z.infer<typeof LookupMapSchema>

/** The map as a lookup: built once at load time, O(1) per query. */
export interface LookupIndex {
  /** The canonical entry for `query`, if one exists: verbatim, then a
   * lowercase fallback so e.g. `SETOPT` finds the lowercased builtin id. */
  lookup(query: string): ResolverHit | null
}

export function lookupIndex(map: LookupMap): LookupIndex {
  const byRaw = new Map<string, ResolverHit>(
    map.entries.map(e => [e.raw, { category: e.category, id: e.id }]),
  )
  return {
    lookup(query) {
      const q = query.trim()
      if (q === "") return null
      const hit = byRaw.get(q)
      if (hit) return hit
      const lower = q.toLowerCase()
      return lower === q ? null : (byRaw.get(lower) ?? null)
    },
  }
}

/**
 * `ranked` with `hit` (the lookup map's claim for the query) at slot 0 when
 * present; the rest keep ranker order. The one promote, shared by product
 * search and the Node-side evals (the parity and sanity fixtures rank
 * without it).
 */
export function promoteToTop(
  ranked: readonly RankedMatch[],
  hit: ResolverHit | null,
): RankedMatch[] {
  const found = hit && ranked.find(m => sameRecord(m.rec, hit))
  return found ? [found, ...ranked.filter(m => m !== found)] : [...ranked]
}
