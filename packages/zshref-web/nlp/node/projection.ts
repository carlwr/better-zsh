// The corpus as the index sees it: every record with its rendered title and
// body added under `_`-prefixed keys (a namespace apart from the records' own
// fields), per category in `docCategories` order. Cached per corpus: the
// retrieval texts are derived from it more than once (build, then validate).

import { createHash } from "node:crypto"
import { cachedUnary } from "@carlwr/typescript-extra"
import {
  type DocCategory,
  type DocCorpus,
  docCategories,
} from "@carlwr/zsh-core"
import { renderRecord } from "@carlwr/zsh-core/render"

export interface ProjectedCategory {
  category: DocCategory
  records: readonly object[]
}

function projectRecords<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
): readonly object[] {
  return [...corpus[cat].values()].map(rec => {
    const { title, mdBody } = renderRecord(corpus, rec)
    return { ...rec, _mdBody: mdBody, _title: title }
  })
}

export const projectCorpus = cachedUnary(
  (corpus: DocCorpus): ProjectedCategory[] =>
    docCategories.map(category => ({
      category,
      records: projectRecords(corpus, category),
    })),
)

/** Content identity of the projection: the index's `corpus_hash`. */
export const corpusFingerprint = (corpus: DocCorpus): string =>
  createHash("sha256")
    .update(JSON.stringify(projectCorpus(corpus)))
    .digest("hex")
