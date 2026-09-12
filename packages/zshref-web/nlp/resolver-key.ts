// The resolver's verdict on a query, as the Rust `search.rs` computed it:
// the ranker's resolver-hit input in oracle mode, and the canonicalizer
// behind the lookup map and the lookup contract.

import type { DocCorpus } from '@carlwr/zsh-core';
import { lookupRaw } from '@carlwr/zsh-core/resolver';
import { classifyOrder, type DocCategory } from '@carlwr/zsh-core/taxonomy';
import type { ResolverHit } from '../src/lib/ranker/types';

/**
 * Direct-or-resolver lookup within one category: trimmed `_id` equality
 * first, then the per-category resolver. zsh-core's `lookupRaw` is exactly
 * that dispatch (the corpus maps are keyed by `idOf`, i.e. `_id`); `resolve`
 * alone is not — it never checks the literal key in template-keyed
 * categories (`!n` resolves to `!str`). Named as the Rust side names it.
 */
export const resolveIn = lookupRaw;

/**
 * First hit over `[category]` if given, else over `classifyOrder`. No
 * `history_expn` filtering: that is a `zsh_docs` concern, not the ranker's.
 */
export function resolverKey(
  corpus: DocCorpus,
  query: string,
  category?: DocCategory
): ResolverHit | null {
  const cats: readonly DocCategory[] = category === undefined ? classifyOrder : [category];
  for (const cat of cats) {
    const hit = resolveIn(corpus, cat, query);
    if (hit) return { category: hit.category, id: hit.id as string };
  }
  return null;
}
