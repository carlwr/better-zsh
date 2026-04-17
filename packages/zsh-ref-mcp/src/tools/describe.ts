import {
  type DocCategory,
  type DocCorpus,
  type DocRecordMap,
  type Documented,
  docCategories,
  docDisplay,
  mkPieceId,
} from "zsh-core"
import { renderDoc } from "zsh-core/render"

export interface DescribeInput {
  readonly category: DocCategory
  readonly id: string
}

export interface DescribeMatch {
  readonly category: DocCategory
  readonly id: string
  readonly display: string
  readonly markdown: string
}

export type DescribeResult =
  | { readonly match: DescribeMatch }
  | { readonly match: null }

const validCategories = new Set<string>(docCategories)

/**
 * Fetch the full record + rendered markdown for a known `{category, id}`.
 *
 * The input is untrusted JSON, so we verify that:
 *   1. `category` is a `DocCategory` value, and
 *   2. `id` is a membership key in `corpus[category]`
 *
 * before minting the `Documented<K>` brand via `mkPieceId`. This follows
 * the "iterating the corpus" sanctioned brand path in DESIGN.md — the cast
 * inside `mkPieceId` is justified by the `.get()` lookup succeeding.
 *
 * Unlike `resolve`, this does NOT apply per-category normalization (no
 * `no_`-stripping for options, no redir tail decomposition) — `describe`
 * expects exact canonical ids, typically surfaced by a prior `zsh_search`
 * response. Pure function; no IO, no process env.
 */
export function describe(
  corpus: DocCorpus,
  input: DescribeInput,
): DescribeResult {
  if (!validCategories.has(input.category)) return { match: null }
  const cat = input.category
  const map = corpus[cat] as ReadonlyMap<string, DocRecordMap[typeof cat]>
  const rec = map.get(input.id)
  if (!rec) return { match: null }
  const id = input.id as Documented<typeof cat>
  return {
    match: {
      category: cat,
      id: input.id,
      display: docDisplay(cat, rec as never),
      markdown: renderDoc(corpus, mkPieceId(cat, id)),
    },
  }
}
