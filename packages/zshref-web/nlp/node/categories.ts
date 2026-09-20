// `categories.json`: category order + the labels the UI shows (dropdown,
// result chips) — the same labels the retrieval text embeds, so a label
// change re-embeds.

import { docCategories, docCategoryLabels } from "@carlwr/zsh-core"

import type { Categories } from "../core/types"

export function categoriesJson(): Categories {
  return {
    version: 1,
    categories: docCategories.map(id => ({ id, label: docCategoryLabels[id] })),
  }
}
