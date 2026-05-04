// MIRRORED-IN: zshref-rs/src/tools/search.rs

import type { DocCorpus } from "@carlwr/zsh-core"
import { ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
import { resolve } from "@carlwr/zsh-core/resolver"
import { classifyOrder, type DocCategory } from "@carlwr/zsh-core/taxonomy"
import { makeToolDef, type ToolDef } from "../tool-defs.ts"
import { type BaseMatch, entries } from "./shared/entries.ts"
import { resolutionDescription, safetyDescription } from "./shared/help.ts"
import { clampLimit, inputSchemaLimit, limitBrief } from "./shared/limits.ts"
import { mkOutputSchema } from "./shared/output-schema.ts"
import {
  briefCategory,
  type Envelope,
  inputSchemaCategory,
  isValidCategory,
  mkEnvelope,
} from "./shared/result.ts"
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
  const q = input.query.trim()
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
  // resolver (option NO_-stripping, redir group-op + tail decomposition,
  // history event-designators, etc.). Hits not already bucketed by the
  // exact/prefix pass surface here. Walks `classifyOrder` when the caller
  // didn't pin a category; otherwise just the one.
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
    ...(e.subKind !== undefined ? { subKind: e.subKind } : {}),
    score,
  }
}

const desc = `\
Find candidate records in the bundled static ${ZSH_UPSTREAM.tag} reference by id/display heading.

${resolutionDescription}

Ranking:
  1. exact id/display
  2. resolved input
  3. prefix
  4. fuzzy score

\`score\` is 1 for exact/resolution/prefix matches. Fuzzy matches use a score in (0,1).

No markdown body. Use \`zsh_docs\` for full docs.

To enumerate without a query, use \`zsh_list\`.

${safetyDescription}`

export const searchToolDef: ToolDef = makeToolDef<
  "query" | "category" | "limit"
>({
  name: "zsh_search",
  brief: "fuzzy-search the zsh reference by id/display",
  description: desc,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search string matched against ids and display headings. Empty or whitespace returns no matches; use `zsh_list` to enumerate.",
      },
      category: inputSchemaCategory,
      limit: inputSchemaLimit,
    },
    required: ["query"],
    additionalProperties: false,
  },
  outputSchema: mkOutputSchema({ score: "required" }),
  flagBriefs: {
    query: "fuzzy-search string (required)",
    category: briefCategory,
    limit: limitBrief,
  },
  execute: (corpus, input): SearchResult =>
    search(corpus, input as unknown as SearchInput),
})
