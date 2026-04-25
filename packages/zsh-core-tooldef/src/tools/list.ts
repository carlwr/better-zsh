import {
  type DocCategory,
  type DocCorpus,
  docCategories,
} from "@carlwr/zsh-core"
import { makeToolDef, type ToolDef } from "../tool-defs.ts"
import { entries } from "./entries.ts"
import { clampLimit, DEFAULT_LIMIT, MAX_LIMIT } from "./limits.ts"

export interface ListInput {
  readonly category?: DocCategory
  readonly limit?: number
}

export interface ListMatch {
  readonly category: DocCategory
  readonly id: string
  readonly display: string
  /** Typed sub-facet of the record (e.g. history `kind`, glob_op `kind`). Absent when the category has no meaningful subKind. */
  readonly subKind?: string
}

export interface ListResult {
  readonly matches: readonly ListMatch[]
  /** Always equals `matches.length`; surfaced explicitly so JSON consumers don't have to count. */
  readonly matchesReturned: number
  /** Total matches before `limit` truncation. `matchesReturned < matchesTotal` iff the response was truncated. */
  readonly matchesTotal: number
}

/**
 * Enumerate records, optionally filtered to one category. Returns
 * `{ category, id, display, subKind? }` per match — no rendered markdown.
 * `limit=0` returns metadata only (`matches: []`, `matchesTotal=N`).
 * Pure; no IO.
 */
export function list(corpus: DocCorpus, input: ListInput): ListResult {
  const limit = clampLimit(input.limit)
  const pool = entries(corpus, input.category)
  const matches = pool.slice(0, limit)
  return {
    matches,
    matchesReturned: matches.length,
    matchesTotal: pool.length,
  }
}

const brandedCategoryList: string = docCategories
  .map(c => `  - '${c}'`)
  .join("\n")

export const listToolDef: ToolDef = makeToolDef({
  name: "zsh_list",
  brief: "enumerate corpus records (id-only; no markdown)",
  description: `\
Enumerate records from the bundled static zsh reference. Identifiers only — pair with \`zsh_docs\` for the rendered markdown body.

Listing is corpus-iteration order; default category order when \`category\` is omitted, or the single category's iteration order when set.

Each match is \`{ category, id, display, subKind? }\`. \`subKind\` is surfaced when the category has a meaningful sub-facet (e.g. history \`kind\`, glob_op \`kind\`, reserved_word \`pos\`).

\`limit\` caps response size (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT} = entire corpus). \`limit=0\` returns metadata only (\`matches: []\`); the response always carries \`matchesReturned\` (== \`matches.length\`) and \`matchesTotal\` (pre-truncation total), so \`matchesReturned < matchesTotal\` signals truncation — raise \`limit\` or narrow \`category\` to see the rest.

Valid \`category\` values:

${brandedCategoryList}

Unknown \`category\` yields an empty match set.

No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: `Optional filter to a single doc category. Unknown categories yield an empty match set.\n\nValid values:\n\n${brandedCategoryList}`,
      },
      limit: {
        type: "integer",
        minimum: 0,
        maximum: MAX_LIMIT,
        description: `Maximum matches to return. Default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT} (entire corpus). \`limit=0\` returns metadata only.\n\nThe response carries \`matchesReturned\` (== \`matches.length\`) and \`matchesTotal\` (pre-truncation total); \`matchesReturned < matchesTotal\` signals truncation — raise \`limit\` or narrow \`category\`.`,
      },
    },
    additionalProperties: false,
  },
  flagBriefs: {
    category: "Filter to one doc category.",
    limit: `Max matches to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
  },
  execute: (corpus, input): ListResult =>
    list(corpus, input as unknown as ListInput),
})
