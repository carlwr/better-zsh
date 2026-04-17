import fuzzysort from "fuzzysort"
import {
  type DocCategory,
  type DocCorpus,
  type DocRecordMap,
  docCategories,
  docDisplay,
} from "zsh-core"
import type { ToolDef } from "../tool-defs.ts"

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
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

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
      out.push({ category: c, id, display: docDisplay(c, rec as never) })
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
  if (!q) return { matches: pool.slice(0, limit) }

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
    const fuzzy = fuzzysort.go(q, rest, {
      keys: ["id", "display"],
      limit: remaining,
      threshold: 0.3,
    })
    for (const r of fuzzy) matches.push(toMatch(r.obj, r.score))
  }
  return { matches }
}

function toMatch(e: Entry, score?: number): SearchMatch {
  return score === undefined
    ? { category: e.category, id: e.id, display: e.display }
    : { category: e.category, id: e.id, display: e.display, score }
}

const brandedCategoryList = docCategories.map(c => `'${c}'`).join(", ")

export const searchToolDef: ToolDef = {
  name: "zsh_search",
  description: `Search the bundled static zsh reference. Fuzzy-matches the query against doc record ids and human display headings across every category (see \`category\` field for the full \`DocCategory\` list). Omit \`query\` to list records (optionally filtered by \`category\`). Ranking: exact id/display > prefix > fuzzy score. Results carry \`{ category, id, display, score? }\` but NOT the rendered markdown body — follow up with \`zsh_describe\` or \`zsh_classify\` for the full doc. \`limit\` caps response size (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT}). No shell execution, no environment access.`,
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
        description: `Optional filter to a single doc category. Valid values are the zsh-core \`DocCategory\` strings: ${brandedCategoryList}. An unknown category yields an empty match set.`,
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
  execute: (corpus, input): SearchResult =>
    search(corpus, input as unknown as SearchInput),
}
