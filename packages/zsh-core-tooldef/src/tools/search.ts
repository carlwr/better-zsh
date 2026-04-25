import {
  type DocCategory,
  type DocCorpus,
  docCategories,
  ZSH_UPSTREAM,
} from "@carlwr/zsh-core"
import fuzzysort from "fuzzysort"
import { makeToolDef, type ToolDef } from "../tool-defs.ts"
import { type Entry, entries } from "./entries.ts"
import { clampLimit, DEFAULT_LIMIT, MAX_LIMIT } from "./limits.ts"

export interface SearchInput {
  readonly query: string
  readonly category?: DocCategory
  readonly limit?: number
}

export interface SearchMatch {
  readonly category: DocCategory
  readonly id: string
  readonly display: string
  /** Typed sub-facet of the record (e.g. history `kind`, glob_op `kind`). Absent when the category has no meaningful subKind. */
  readonly subKind?: string
  /** Fuzzy score (0..1). Absent on exact / prefix entries. */
  readonly score?: number
}

export interface SearchResult {
  readonly matches: readonly SearchMatch[]
  /** Always equals `matches.length`; surfaced explicitly so JSON consumers don't have to count. */
  readonly matchesReturned: number
  /** Total matches before `limit` truncation. `matchesReturned < matchesTotal` iff the response was truncated. */
  readonly matchesTotal: number
}

/**
 * Search the static zsh reference. Ranking: exact id/display > prefix >
 * fuzzy. Empty/whitespace query returns an empty match set (use
 * `zsh_list` to enumerate). `limit=0` returns metadata only.
 * Pure; no IO.
 */
export function search(corpus: DocCorpus, input: SearchInput): SearchResult {
  const limit = clampLimit(input.limit)
  const pool = entries(corpus, input.category)
  const q = input.query.trim()
  if (!q) {
    return { matches: [], matchesReturned: 0, matchesTotal: 0 }
  }

  const qLow = q.toLowerCase()
  const exact: Entry[] = []
  const prefix: Entry[] = []
  const rest: Entry[] = []
  for (const e of pool) {
    const idLow = e.id.toLowerCase()
    const dispLow = e.display.toLowerCase()
    if (idLow === qLow || dispLow === qLow) exact.push(e)
    else if (idLow.startsWith(qLow) || dispLow.startsWith(qLow)) prefix.push(e)
    else rest.push(e)
  }

  // Run fuzzy unlimited so `matchesTotal` reflects the true pre-truncation
  // count across all three branches; cost is negligible at corpus scale.
  const fuzzyAll = fuzzysort.go(q, rest, {
    keys: ["id", "display"],
    threshold: 0.3,
  })
  const matchesTotal = exact.length + prefix.length + fuzzyAll.length

  const matches: SearchMatch[] = []
  for (const e of exact) {
    if (matches.length >= limit) break
    matches.push(toMatch(e))
  }
  for (const e of prefix) {
    if (matches.length >= limit) break
    matches.push(toMatch(e))
  }
  if (matches.length < limit) {
    const remaining = limit - matches.length
    for (const r of fuzzyAll.slice(0, remaining)) {
      matches.push(toMatch(r.obj, r.score))
    }
  }
  return { matches, matchesReturned: matches.length, matchesTotal }
}

function toMatch(e: Entry, score?: number): SearchMatch {
  const base: SearchMatch = {
    category: e.category,
    id: e.id,
    display: e.display,
  }
  const withSub: SearchMatch =
    e.subKind === undefined ? base : { ...base, subKind: e.subKind }
  return score === undefined ? withSub : { ...withSub, score }
}

const brandedCategoryList: string = docCategories
  .map(c => `  - '${c}'`)
  .join("\n")

export const searchToolDef: ToolDef = makeToolDef<
  "query" | "category" | "limit"
>({
  name: "zsh_search",
  brief: "fuzzy-search the zsh reference by id/display",
  description: `\
Search the bundled static ${ZSH_UPSTREAM.tag} reference. Fuzzy-matches the query against record ids and display headings across every category (or one category if \`category\` is set).

Ranking: exact id/display > prefix > fuzzy score.

Results carry \`{ category, id, display, subKind?, score? }\` but NOT the rendered markdown body — follow up with \`zsh_docs\` for the full doc. \`subKind\` is surfaced when the category has a meaningful sub-facet (e.g. history \`kind\`, glob_op \`kind\`, reserved_word \`pos\`).

\`limit\` caps response size (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT} = entire corpus). \`limit=0\` returns metadata only (\`matches: []\`); the response always carries \`matchesReturned\` (== \`matches.length\`) and \`matchesTotal\` (pre-truncation total), so \`matchesReturned < matchesTotal\` signals truncation — raise \`limit\` or narrow \`category\`/\`query\` to see the rest.

To enumerate without a query, use \`zsh_list\`.

Valid \`category\` values:

${brandedCategoryList}

No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Fuzzy search string matched against ids and display headings. Empty/whitespace returns an empty match set — use `zsh_list` to enumerate.\n\nRanking: exact id/display > prefix > fuzzy score.",
      },
      category: {
        type: "string",
        description: `Optional filter to a single doc category. Unknown categories yield an empty match set.\n\nValid values:\n\n${brandedCategoryList}`,
      },
      limit: {
        type: "integer",
        minimum: 0,
        maximum: MAX_LIMIT,
        description: `Maximum matches to return. Default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT} (entire corpus). \`limit=0\` returns metadata only.\n\nThe response carries \`matchesReturned\` (== \`matches.length\`) and \`matchesTotal\` (pre-truncation total); \`matchesReturned < matchesTotal\` signals truncation — raise \`limit\` or narrow \`category\`/\`query\`.`,
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  flagBriefs: {
    query: "Fuzzy-search string (required).",
    category: "Filter to one doc category.",
    limit: `Max matches to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
  },
  execute: (corpus, input): SearchResult =>
    search(corpus, input as unknown as SearchInput),
})
