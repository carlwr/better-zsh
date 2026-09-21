// The resolver's verdict on a query: the canonicalizer behind the lookup
// map and the lookup contract.

import type { DocCategory, DocCorpus, DocRecord } from "@carlwr/zsh-core"
import { resolve, resolveAll } from "@carlwr/zsh-core/resolver"
import type { RecordId, ResolverHit } from "../core/types"

/** A corpus record's identity as the NLP carries it: the brand peeled. */
export const identityOf = (rec: DocRecord): RecordId => ({
  category: rec.category,
  id: rec.id as string,
})

/**
 * zsh-core's verdict on `query`: scoped to `category` if given, else the
 * category walk's first hit — its order and admission are zsh-core's.
 */
export function resolverKey(
  corpus: DocCorpus,
  query: string,
  category?: DocCategory,
): ResolverHit | null {
  const hit =
    category === undefined
      ? resolveAll(corpus, query)[0]
      : resolve(corpus, category, query)
  return hit ? identityOf(hit.record) : null
}
