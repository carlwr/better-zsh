// The corpus as JSON consumers see it: zsh-core's projection of every record
// (rendered markdown body and title added), per category in
// `docCategories` order. Cached per corpus: the retrieval texts are derived
// from it more than once (build, then validate).

import { cachedUnary } from "@carlwr/typescript-extra"
import type { DocCorpus } from "@carlwr/zsh-core"
import { projectRecords } from "@carlwr/zsh-core/json"
import { type DocCategory, docCategories } from "@carlwr/zsh-core/taxonomy"

export interface ProjectedCategory {
  category: DocCategory
  records: readonly object[]
}

export const projectCorpus = cachedUnary(
  (corpus: DocCorpus): ProjectedCategory[] =>
    docCategories.map(category => ({
      category,
      records: projectRecords(corpus, category),
    })),
)
