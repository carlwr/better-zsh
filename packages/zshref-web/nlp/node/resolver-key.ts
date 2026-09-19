// The resolver's verdict on a query: the canonicalizer behind the lookup
// map and the lookup contract.

import type { DocCorpus } from "@carlwr/zsh-core"
import { resolve } from "@carlwr/zsh-core/resolver"
import {
  classifyOrder,
  type DocCategory,
  type DocRecordMap,
  idOf,
} from "@carlwr/zsh-core/taxonomy"
import type { RecordId, ResolverHit } from "../core/types"

/** A corpus record's identity as the NLP carries it: the brand peeled. */
export const identityOf = <K extends DocCategory>(
  cat: K,
  rec: DocRecordMap[K],
): RecordId => ({ category: cat, id: idOf(cat, rec) as string })

/**
 * First hit over `[category]` if given, else over `classifyOrder`; per
 * category, zsh-core's `resolve` — trimmed `_id` equality first (the corpus
 * maps are keyed by `idOf`, i.e. `_id`), then the resolver. No
 * `history_expn` filtering: that is a `zsh_docs` concern, not the ranker's.
 */
export function resolverKey(
  corpus: DocCorpus,
  query: string,
  category?: DocCategory,
): ResolverHit | null {
  const cats: readonly DocCategory[] =
    category === undefined ? classifyOrder : [category]
  for (const cat of cats) {
    const hit = resolve(corpus, cat, query)
    if (hit) return { category: hit.category, id: hit.id as string }
  }
  return null
}
