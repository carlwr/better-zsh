// The core search pipeline over the Node embedder, for the evals.

import { type DocCategory, isDocCategory } from "@carlwr/zsh-core/taxonomy"

import type { LookupIndex } from "../core/lookup-map"
import type { Rules } from "../core/rules"
import { type SearchResult, search } from "../core/search"
import type { VectorIndex } from "../core/types"
import { type Embedder, embedText } from "./embedder-node"

export interface SearchInput {
  query: string
  /** Default `DEFAULT_LIMIT`. */
  limit?: number
  category?: string
}

export interface SearchDeps {
  index: VectorIndex
  rules: Rules
  lookup: LookupIndex
  embedder: Embedder
}

const DEFAULT_LIMIT = 10

/** Narrow a request's `category`; an unknown one is a caller error, not an empty result. */
function docCategory(s: string): DocCategory {
  if (!isDocCategory(s))
    throw new Error(`unknown category ${JSON.stringify(s)}`)
  return s
}

export async function searchNode(
  input: SearchInput,
  deps: SearchDeps,
): Promise<SearchResult> {
  return search({
    query: input.query,
    embed: text => embedText(deps.embedder, text),
    index: deps.index,
    rules: deps.rules,
    lookup: deps.lookup,
    limit: input.limit ?? DEFAULT_LIMIT,
    categories:
      input.category === undefined
        ? null
        : new Set([docCategory(input.category)]),
  })
}
