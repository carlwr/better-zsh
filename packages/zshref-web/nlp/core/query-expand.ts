// Query-time, embedding-only synonym expansion. Maps colloquial query
// vocabulary onto the corpus's canonical term by appending the canonical word
// to the string that gets EMBEDDED — the caller keeps passing the raw query to
// the ranker, so expansion never enters the lexical-overlap bag. That split is
// the anti-swamp guard: lexical credit for a synonym would promote records that
// merely contain the literal token.

import type { QueryExpansion } from "./rules"

// A short cap: even with one canonical term per rule, several rules firing on a
// 1-2 word query would pull its embedding toward a generic centroid. Bounding
// the appended terms keeps the user's actual words dominant.
const MAX_APPENDED = 2

/**
 * Return the query text to embed: the raw query with up to `MAX_APPENDED`
 * canonical terms appended for any matching directional rule. A canonical term
 * already present in the query is skipped (no self-expansion, no dupes).
 */
export function expandQueryForEmbedding(
  query: string,
  rules: readonly QueryExpansion[],
): string {
  const has = termMatcher(query)
  const adds: string[] = []
  for (const rule of rules) {
    if (adds.length >= MAX_APPENDED) break
    const add = rule.add
    if (has(add) || adds.includes(add)) continue
    if (rule.when.some(has)) adds.push(add)
  }
  if (adds.length === 0) return query
  return `${query} ${adds.join(" ")}`
}

/**
 * Whether a (lowercased) term occurs in `query`: a multi-word term as a
 * substring phrase, a word as a whole word. Words are alphanumeric runs:
 * triggers and canonical terms are written that way.
 */
function termMatcher(query: string): (term: string) => boolean {
  const hay = query.toLowerCase()
  const words = new Set(hay.split(/[^a-z0-9]+/))
  return term => (term.includes(" ") ? hay.includes(term) : words.has(term))
}
