// `categories.json`: category order + the labels the UI shows (dropdown,
// result chips) — the same labels the retrieval text embeds, so a label
// change re-embeds.

import { docCategories, docCategoryLabels } from "@carlwr/zsh-core/taxonomy"

import type { Category } from "../src/lib/artifacts"

export interface CategoriesJson {
  version: 1
  categories: Category[]
}

export function categoriesJson(): CategoriesJson {
  return {
    version: 1,
    categories: docCategories.map(id => ({ id, label: docCategoryLabels[id] })),
  }
}
