// The corpus as JSON consumers see it: zsh-core's projection of every record
// (rendered markdown body and identity fields added), per category in
// `docCategories` order. Cached per corpus — rendering is the costly part,
// and both the retrieval texts and the corpus hash walk it.

import { cachedUnary } from '@carlwr/typescript-extra';
import type { DocCorpus } from '@carlwr/zsh-core';
import { augmentWithMarkdown } from '@carlwr/zsh-core/json';
import { type DocCategory, docCategories } from '@carlwr/zsh-core/taxonomy';

export interface ProjectedCategory {
  category: DocCategory;
  records: readonly object[];
}

export const projectCorpus = cachedUnary(
  (corpus: DocCorpus): ProjectedCategory[] =>
    docCategories.map((category) => ({ category, records: augmentWithMarkdown(corpus, category) }))
);
