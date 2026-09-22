// The corpus as the index reads it: every record with its rendered title and
// body attached, per category in `docCategories` order. Cached per corpus —
// the retrieval texts are derived from it more than once (build, then
// validate).

import { createHash } from "node:crypto"
import { cachedUnary } from "@carlwr/typescript-extra"
import {
  type DocCategory,
  type DocCorpus,
  docCategories,
} from "@carlwr/zsh-core"
import { renderRecord } from "@carlwr/zsh-core/render"

/**
 * A corpus record with what rendering it produced merged in. The added keys
 * are `_`-prefixed — a namespace apart from the record's own field names,
 * which is how `retrieval-text.ts` tells them apart when it walks a record
 * generically. Not zsh-core's `RenderedRecord`, which is the render output
 * (`title`, `mdBody`) on its own.
 *
 * The shape matches what zsh-core's JSON build produces for its own
 * consumers — both answer "the record plus its rendered form" — but it is
 * reimplemented here, not imported: zsh-core exports no such function. No
 * zsh-core JSON artifact is read anywhere in this package.
 */
export interface WithRendered {
  readonly _title: string
  readonly _mdBody: string
}

export interface RenderedCategory {
  category: DocCategory
  records: readonly WithRendered[]
}

const renderCategory = (
  corpus: DocCorpus,
  cat: DocCategory,
): readonly WithRendered[] =>
  [...corpus[cat].values()].map(rec => {
    const { title, mdBody } = renderRecord(corpus, rec)
    return { ...rec, _mdBody: mdBody, _title: title }
  })

export const renderedCorpus = cachedUnary(
  (corpus: DocCorpus): RenderedCategory[] =>
    docCategories.map(category => ({
      category,
      records: renderCategory(corpus, category),
    })),
)

/** Content identity of the rendered corpus: the index's `corpus_hash`. */
export const corpusFingerprint = (corpus: DocCorpus): string =>
  createHash("sha256")
    .update(JSON.stringify(renderedCorpus(corpus)))
    .digest("hex")
