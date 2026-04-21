import {
  type DocCategory,
  type DocCorpus,
  type DocRecordMap,
  type Documented,
  docCategories,
  mkPieceId,
} from "@carlwr/zsh-core"
import { renderDoc } from "@carlwr/zsh-core/render"
import { makeToolDef } from "../tool-defs.ts"
import { display } from "./doc-display.ts"

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
 * Expects exact canonical ids (typically from a prior `zsh_search`); does
 * not apply per-category normalization. Pure; no IO.
 */
// Input is untrusted JSON. We check `category` ∈ `DocCategory` and `id` ∈
// corpus[category], then mint `Documented<K>` via the sanctioned
// "iterating the corpus" path (DESIGN.md §Brand semantics).
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
      display: display(cat, rec),
      markdown: renderDoc(corpus, mkPieceId(cat, id)),
    },
  }
}

export const describeToolDef = makeToolDef({
  name: "zsh_describe",
  brief: "fetch the full doc for a known {category, id}",
  description: `\
Fetch the full record for a known \`{ category, id }\` from the
bundled static zsh reference.

Returns \`{ match: { category, id, display, markdown } }\` with the
rendered markdown body, or \`{ match: null }\` when the id is not a
member of the given category's corpus.

Expects exact canonical ids (typically surfaced by a prior
\`zsh_search\` response). Unlike \`zsh_classify\` /
\`zsh_lookup_option\` it does NOT apply per-category normalization
such as NO_* stripping.

No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description:
          "Doc category (a zsh-core `DocCategory` value) — e.g. 'option', 'builtin', 'cond_op', 'reserved_word'. Unknown values yield { match: null }.",
      },
      id: {
        type: "string",
        description:
          "Canonical id within `category` (e.g. 'autocd' for option, 'echo' for builtin). Must be an exact corpus key — usually obtained from `zsh_search`.",
      },
    },
    required: ["category", "id"],
    additionalProperties: false,
  },
  flagBriefs: {
    category: "Doc category (see description for valid values).",
    id: "Canonical id within the category (exact corpus key).",
  },
  execute: (corpus, input): DescribeResult =>
    describe(corpus, input as unknown as DescribeInput),
})
