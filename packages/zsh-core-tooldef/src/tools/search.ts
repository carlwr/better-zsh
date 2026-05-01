// MIRRORED-IN: zshref-rs/src/tools/search.rs

import type { DocCorpus } from "@carlwr/zsh-core"
import { ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
import { resolve } from "@carlwr/zsh-core/resolver"
import { classifyOrder, type DocCategory } from "@carlwr/zsh-core/taxonomy"
import { makeToolDef, type ToolDef } from "../tool-defs.ts"
import { type BaseMatch, entries } from "./entries.ts"
import { clampLimit, DEFAULT_LIMIT, MAX_LIMIT } from "./limits.ts"
import { mkOutputSchema } from "./output-schema.ts"
import {
  categoryList,
  type Envelope,
  isValidCategory,
  mkEnvelope,
} from "./result.ts"
import { fuzzySortMatches, seenKey } from "./search-fuzzy.ts"

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

const catList = categoryList()

export const searchToolDef: ToolDef = makeToolDef<
  "query" | "category" | "limit"
>({
  name: "zsh_search",
  brief: "fuzzy-search the zsh reference by id/display",
  description: `\
Search the bundled static ${ZSH_UPSTREAM.tag} reference. Fuzzy-matches the query against record ids and display headings across every category (or one category if \`category\` is set).

Ranking: exact id/display > resolver (corpus-aware close-variant match, e.g. \`au_to_cd\` → \`autocd\`) > prefix > fuzzy score.

Results carry \`{ category, id, display, subKind?, score }\` but NOT the rendered markdown body — follow up with \`zsh_docs\` for the full doc. \`score\` is \`1.0\` for exact / resolver / prefix tiers; fuzzy-tier matches carry a score in \`(0, 1)\`. \`subKind\` is surfaced when the category has a meaningful sub-facet (e.g. history \`kind\`, glob_op \`kind\`, reserved_word \`pos\`).

\`limit\` caps response size (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT} = entire corpus). \`limit=0\` returns metadata only (\`matches: []\`); the response always carries \`matchesReturned\` (== \`matches.length\`) and \`matchesTotal\` (pre-truncation total), so \`matchesReturned < matchesTotal\` signals truncation — raise \`limit\` or narrow \`category\`/\`query\` to see the rest.

To enumerate without a query, use \`zsh_list\`.

Valid \`category\` values:

${catList}

No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Fuzzy search string matched against ids and display headings. Empty/whitespace returns an empty match set — use `zsh_list` to enumerate.\n\nRanking: exact id/display > resolver (corpus-aware close-variant match) > prefix > fuzzy score.",
      },
      category: {
        type: "string",
        description: `Optional filter to a single doc category. Unknown categories yield an empty match set.\n\nValid values:\n\n${catList}`,
      },
      limit: {
        type: "integer",
        minimum: 0,
        maximum: MAX_LIMIT,
        default: DEFAULT_LIMIT,
        description: `Maximum matches to return. Default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT} (entire corpus). \`limit=0\` returns metadata only.\n\nThe response carries \`matchesReturned\` (== \`matches.length\`) and \`matchesTotal\` (pre-truncation total); \`matchesReturned < matchesTotal\` signals truncation — raise \`limit\` or narrow \`category\`/\`query\`.`,
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  outputSchema: mkOutputSchema({ score: "required" }),
  flagBriefs: {
    query: "Fuzzy-search string (required).",
    category: "Filter to one doc category.",
    limit: `Max matches to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
  },
  execute: (corpus, input): SearchResult =>
    search(corpus, input as unknown as SearchInput),
})
