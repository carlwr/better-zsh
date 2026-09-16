// The SPA's search: the core pipeline over the browser embedder. The bundle
// carries no resolver (it is zsh-core-free): the pre-computed lookup map is
// its canonical-form resolution.

import type { LookupIndex } from "../core/lookup-map"
import type { Rules } from "../core/rules"
import { type SearchResult, search as searchWith } from "../core/search"
import type { VectorIndex } from "../core/types"
import { embedText } from "./embedder"

export function search(args: {
  query: string
  index: VectorIndex
  rules: Rules
  lookup: LookupIndex
  limit: number
  /** null = no filter; a list keeps exactly those (so `[]` keeps nothing).
   * The caller passes null when every category is ticked: robust to a record
   * whose category is absent from the checkbox list. */
  categories: string[] | null
}): Promise<SearchResult> {
  return searchWith({
    ...args,
    embed: embedText,
    categories: args.categories && new Set(args.categories),
  })
}
