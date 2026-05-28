// WEB-MIRROR-OF: zshref-rs/src/nlp/query_expand.rs
//
// Query-time, embedding-only synonym expansion. Maps colloquial query
// vocabulary onto the corpus's canonical term by appending the canonical word
// to the string that gets EMBEDDED — the caller keeps passing the raw query to
// the ranker, so expansion never enters the lexical-overlap bag. That split is
// the anti-swamp guard: lexical credit for a synonym would promote records that
// merely contain the literal token.

import type { QueryExpansion } from './types';

// A short cap: even with one canonical term per rule, several rules firing on a
// 1-2 word query would pull its embedding toward a generic centroid. Bounding
// the appended terms keeps the user's actual words dominant.
const MAX_APPENDED = 2;

/**
 * Return the query text to embed: the raw query with up to `MAX_APPENDED`
 * canonical terms appended for any matching directional rule. A canonical term
 * already present in the query is skipped (no self-expansion, no dupes).
 */
export function expandQueryForEmbedding(query: string, rules: QueryExpansion[]): string {
  const hay = query.toLowerCase();
  const adds: string[] = [];
  for (const rule of rules) {
    if (adds.length >= MAX_APPENDED) break;
    const add = rule.add;
    if (wordIn(hay, add) || adds.includes(add)) continue;
    if (rule.when.some((w) => wordIn(hay, w))) adds.push(add);
  }
  if (adds.length === 0) return query;
  return query + ' ' + adds.join(' ');
}

/**
 * Whole-word match; multi-word needles match as a substring phrase. Mirrors
 * Rust `word_in`: triggers and canonical terms are alphanumeric words.
 */
function wordIn(hay: string, needle: string): boolean {
  if (needle.includes(' ')) return hay.includes(needle);
  return hay.split(/[^a-z0-9]+/).some((w) => w === needle.toLowerCase());
}
