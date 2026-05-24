// MIRRORED-IN: zshref-rs/src/tools/search.rs

import { isDefined, trim } from "@carlwr/typescript-extra"
import type { DocCorpus } from "@carlwr/zsh-core"
import { resolve } from "@carlwr/zsh-core/resolver"
import { classifyOrder, type DocCategory } from "@carlwr/zsh-core/taxonomy"
import { buildToolDef, type SchemaShape, type ToolDef } from "../tool-defs.ts"
import { searchProse } from "./prose.ts"
import { type BaseMatch, entries } from "./shared/entries.ts"
import {
  categoryShape,
  type Envelope,
  isValidCategory,
  mkEnvelope,
} from "./shared/envelope.ts"
import { clampLimit, limitShape } from "./shared/limits.ts"
import { mkOutputSchema } from "./shared/output-schema.ts"
import { fuzzySortMatches, seenKey } from "./shared/search-fuzzy.ts"

export interface SearchInput {
  readonly query: string
  readonly category?: DocCategory
  readonly limit?: number
}

export interface SearchMatch extends BaseMatch {
  /**
   * Score in `[0, 1]`. `1.0` for exact / resolver / prefix tiers; fuzzy
   * tier uses fuzzysort's normalized score in `(0, 1)`.
   */
  readonly score: number
}

export type SearchResult = Envelope<SearchMatch>

/**
 * Ranked search: exact / resolver / prefix, then fuzzy. Empty query → empty
 * set (use `zsh_list` to enumerate). `limit=0` → metadata only. Pure; no IO.
 */
export function search(corpus: DocCorpus, input: SearchInput): SearchResult {
  if (input.category !== undefined && !isValidCategory(input.category))
    return mkEnvelope<SearchMatch>([])

  const limit = clampLimit(input.limit)
  const pool = entries(corpus, input.category)
  const q = trim(input.query)
  if (!q) return mkEnvelope<SearchMatch>([])

  const qLow = q.toLowerCase()
  const exact: BaseMatch[] = []
  const prefix: BaseMatch[] = []
  const rest: BaseMatch[] = []
  // Dedup invariant: no two matches share `(category, id)`. The seen-set
  // spans all tiers; covered by search tool tests.
  const seen = new Set<string>()
  for (const e of pool) {
    const idLow = e.id.toLowerCase()
    const dispLow = e.display.toLowerCase()
    if (idLow === qLow || dispLow === qLow) {
      exact.push(e)
      seen.add(seenKey(e.category, e.id))
    } else if (idLow.startsWith(qLow) || dispLow.startsWith(qLow)) {
      prefix.push(e)
      seen.add(seenKey(e.category, e.id))
    } else {
      rest.push(e)
    }
  }

  // Resolver tier: route the query through each category's per-category
  // resolver (option NO_-stripping, redirection group-op + tail
  // decomposition, history-expansion event-designators, etc.). Hits not
  // already bucketed by the exact/prefix pass surface here. Walks
  // `classifyOrder` when the caller didn't pin a category; otherwise just
  // the one.
  const resolverHits: BaseMatch[] = []
  const resolverCats: readonly DocCategory[] =
    input.category !== undefined ? [input.category] : classifyOrder
  // `(category, id)` → BaseMatch so resolver hits can be matched without
  // re-walking the pool.
  const byKey = new Map<string, BaseMatch>()
  for (const e of pool) byKey.set(seenKey(e.category, e.id), e)
  for (const cat of resolverCats) {
    const pid = resolve(corpus, cat, q)
    if (!pid) continue
    const k = seenKey(pid.category, pid.id as string)
    if (seen.has(k)) continue
    const e = byKey.get(k)
    if (!e) continue
    resolverHits.push(e)
    seen.add(k)
  }

  // Run fuzzy unlimited so `matchesTotal` reflects the true pre-truncation
  // count across every tier; cost is negligible at corpus scale.
  const fuzzyPool = rest.filter(e => !seen.has(seenKey(e.category, e.id)))
  const fuzzyAll = fuzzySortMatches(q, fuzzyPool)
  const matchesTotal =
    exact.length + resolverHits.length + prefix.length + fuzzyAll.length

  const matches: SearchMatch[] = []
  const pushTier = (es: readonly BaseMatch[]) => {
    for (const e of es) {
      if (matches.length >= limit) return
      matches.push(toMatch(e, 1.0))
    }
  }
  pushTier(exact)
  pushTier(resolverHits)
  pushTier(prefix)
  if (matches.length < limit) {
    const remaining = limit - matches.length
    for (const r of fuzzyAll.slice(0, remaining)) {
      matches.push(toMatch(r.obj, r.score))
    }
  }
  return mkEnvelope(matches, matchesTotal)
}

function toMatch(e: BaseMatch, score: number): SearchMatch {
  return {
    category: e.category,
    id: e.id,
    display: e.display,
    ...(isDefined(e.subKind) ? { subKind: e.subKind } : {}),
    score,
  }
}

const searchShape: SchemaShape<"query" | "category" | "limit"> = {
  type: "object",
  properties: {
    query: { type: "string" },
    category: categoryShape,
    limit: limitShape,
  },
  required: ["query"],
  additionalProperties: false,
}

export const searchToolDef: ToolDef = buildToolDef<
  "query" | "category" | "limit"
>({
  name: "zsh_search",
  prose: searchProse,
  shape: searchShape,
  outputSchema: mkOutputSchema({ score: "required" }),
  execute: (corpus, input): SearchResult =>
    search(corpus, input as unknown as SearchInput),
})
