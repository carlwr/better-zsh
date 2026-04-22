import {
  type DocCategory,
  type DocCorpus,
  type DocRecordMap,
  docCategories,
  ZSH_UPSTREAM,
} from "@carlwr/zsh-core"
import fuzzysort from "fuzzysort"
import { makeToolDef } from "../tool-defs.ts"
import { display } from "./doc-display.ts"

export interface SearchInput {
  readonly query?: string
  readonly category?: DocCategory
  readonly limit?: number
}

export interface SearchMatch {
  readonly category: DocCategory
  readonly id: string
  readonly display: string
  /** Fuzzy score (0..1). Absent on list-all / exact / prefix entries. */
  readonly score?: number
}

export interface SearchResult {
  readonly matches: readonly SearchMatch[]
  /** Always equals `matches.length`; surfaced explicitly so JSON consumers don't have to count. */
  readonly matchesReturned: number
  /** Total matches before `limit` truncation. `matchesReturned < matchesTotal` iff the response was truncated. */
  readonly matchesTotal: number
}

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 500

interface Entry {
  readonly category: DocCategory
  readonly id: string
  readonly display: string
}

/**
 * Build the flat list of candidate entries from the corpus. Cheap: iterates
 * `corpus[cat].keys()` + `docDisplay(cat, rec)`; no markdown rendering.
 */
function entries(corpus: DocCorpus, cat?: DocCategory): Entry[] {
  const cats = cat ? [cat] : docCategories
  const out: Entry[] = []
  for (const c of cats) {
    const map = corpus[c] as ReadonlyMap<string, DocRecordMap[DocCategory]>
    for (const [id, rec] of map) {
      out.push({ category: c, id, display: display(c, rec) })
    }
  }
  return out
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT
  const n = Math.max(1, Math.floor(limit))
  return Math.min(n, MAX_LIMIT)
}

/**
 * Search the static zsh reference. Ranking: exact id/display > prefix >
 * fuzzy. Empty query lists records (optionally filtered by category),
 * capped by `limit`. Pure; no IO.
 */
export function search(corpus: DocCorpus, input: SearchInput): SearchResult {
  const limit = clampLimit(input.limit)
  const pool = entries(corpus, input.category)
  const q = (input.query ?? "").trim()
  if (!q) {
    const matches = pool.slice(0, limit)
    return {
      matches,
      matchesReturned: matches.length,
      matchesTotal: pool.length,
    }
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
  return score === undefined
    ? { category: e.category, id: e.id, display: e.display }
    : { category: e.category, id: e.id, display: e.display, score }
}

const brandedCategoryList = docCategories.map(c => `  - '${c}'`).join("\n")

export const searchToolDef = makeToolDef({
  name: "zsh_search",
  brief: "fuzzy-search the zsh reference by id/display",
  description: `\
Search the bundled static ${ZSH_UPSTREAM.tag} reference. Fuzzy-matches the query against record ids and display headings across every category.

Listing mode: omit \`query\` to enumerate records, optionally filtered by \`category\`. Set \`category\` and leave \`query\` empty to list every record in a category; raise \`limit\` up to ${MAX_LIMIT} to see all of them in one response.

Ranking: exact id/display > prefix > fuzzy score.

Results carry \`{ category, id, display, score? }\` but NOT the rendered markdown body — follow up with \`zsh_describe\` or \`zsh_classify\` for the full doc.

\`limit\` caps response size (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT}). The response also returns \`matchesReturned\` (== \`matches.length\`) and \`matchesTotal\` (pre-truncation total), so \`matchesReturned < matchesTotal\` signals truncation — raise \`limit\` or narrow \`category\`/\`query\` to see the rest.

Valid \`category\` values:

${brandedCategoryList}

No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Optional fuzzy search string matched against ids and display headings. Empty/omitted returns records ordered by corpus iteration, capped by `limit`.",
      },
      category: {
        type: "string",
        description:
          "Optional filter to a single doc category. See command help for valid values. Unknown categories yield an empty match set.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: MAX_LIMIT,
        description: `Maximum matches to return. Default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT}.`,
      },
    },
    additionalProperties: false,
  },
  flagBriefs: {
    query: "Fuzzy-search string (omit to list all).",
    category: "Filter to one doc category (see description).",
    limit: `Max matches to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
  },
  execute: (corpus, input): SearchResult =>
    search(corpus, input as unknown as SearchInput),
})
