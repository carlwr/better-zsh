// `categories.json`: category order + the canonical labels the UI shows
// (dropdown, result chips). Distinct from the retrieval-text label baked
// into `RecordText.category_label` (`retrieval-text.ts`), so the UI can
// change wording without a re-embed.

import { docCategories, docCategoryLabels } from '@carlwr/zsh-core/taxonomy';

import type { Category } from '../src/lib/artifacts';

export interface CategoriesJson {
  version: 1;
  categories: Category[];
}

export function categoriesJson(): CategoriesJson {
  return {
    version: 1,
    categories: docCategories.map((id) => ({ id, label: docCategoryLabels[id] }))
  };
}
