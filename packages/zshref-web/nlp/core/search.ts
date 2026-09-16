// The search pipeline, embedder-agnostic: embed the query → rank → the
// lookup-map promote → the cut. Each runtime supplies its embedder and its
// calling convention around this. The pre-ranker lookup-map check hard-
// promotes a canonical-identifier query (`AUTO_CD`, `_arguments`) to slot 0
// — the resolver's claim is categorical, not probabilistic, so it bypasses
// ranker math for the top slot; slots 1..N still come from the ranker.

import { type LookupIndex, promoteToTop } from "./lookup-map"
import { expandQueryForEmbedding } from "./query-expand"
import { rank } from "./rank"
import type { Rules } from "./rules"
import type { RankedMatch, VectorIndex } from "./types"

export interface SearchResult {
  matches: RankedMatch[]
  /** Matches before the `limit` cut. */
  total: number
}

export interface SearchArgs {
  query: string
  /** The runtime's embedder: a unit vector for `queryEmbedText`'s output. */
  embed: (text: string) => Promise<Float32Array>
  index: VectorIndex
  rules: Rules
  lookup: LookupIndex
  limit: number
  /** null = every category; a set keeps exactly those (an empty set: nothing). */
  categories: ReadonlySet<string> | null
}

/** The text a query is embedded as: expanded (embedding-only synonyms), prefixed. */
export function queryEmbedText(query: string, rules: Rules): string {
  return `query: ${expandQueryForEmbedding(query, rules.synonyms.query_expansions)}`
}

export async function search(args: SearchArgs): Promise<SearchResult> {
  const q = args.query.trim()
  if (q === "") return { matches: [], total: 0 }
  // Expansion is embedding-only: raw `q` drives the lexical boosts in `rank`.
  const queryVec = await args.embed(queryEmbedText(q, args.rules))
  const cats = args.categories
  // Filtered after ranking, never by a narrower index: the category
  // penalties derive from full-index counts.
  const kept = rank(q, queryVec, args.index, args.rules).filter(
    m => cats === null || cats.has(m.rec.category),
  )
  const ranked = promoteToTop(kept, args.lookup.lookup(q))
  return { matches: ranked.slice(0, args.limit), total: ranked.length }
}
