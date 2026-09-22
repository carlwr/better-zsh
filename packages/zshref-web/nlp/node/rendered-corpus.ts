// The corpus as the index reads it: every record with its rendered title and
// body attached, per category in `docCategories` order. Cached per corpus —
// the retrieval texts are derived from it more than once (build, then
// validate).

import { createHash } from "node:crypto"
import { cachedUnary } from "@carlwr/typescript-extra"
import { type DocCorpus, docCategories } from "@carlwr/zsh-core"
import { projectRecords } from "@carlwr/zsh-core/render"

export const renderedCorpus = cachedUnary((corpus: DocCorpus) =>
  docCategories.map(category => ({
    category,
    records: projectRecords(corpus, category),
  })),
)

/** Content identity of the rendered corpus: the index's `corpus_hash`. */
export const corpusFingerprint = (corpus: DocCorpus): string =>
  createHash("sha256")
    .update(JSON.stringify(renderedCorpus(corpus)))
    .digest("hex")
