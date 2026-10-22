// The search corpus as the index reads it: every lexicon record with its
// rendered title and body attached, per category in `docCategories` order.
// Cached per lexicon — the retrieval texts are derived from it more than once
// (build, then validate).

import { createHash } from "node:crypto"
import { cachedUnary } from "@carlwr/typescript-extra"
import { docCategories, type Lexicon } from "@carlwr/zsh-core"
import { projectRecords } from "@carlwr/zsh-core/render"

export const renderedCorpus = cachedUnary((lexicon: Lexicon) =>
  docCategories.map(category => ({
    category,
    records: projectRecords(lexicon, category),
  })),
)

/** Content identity of the rendered corpus: the index's `corpus_hash`. */
export const corpusFingerprint = (lexicon: Lexicon): string =>
  createHash("sha256")
    .update(JSON.stringify(renderedCorpus(lexicon)))
    .digest("hex")
