// MIRRORED-IN: zshref-rs/src/tools/list.rs

import type { DocCorpus } from "@carlwr/zsh-core"
import type { DocCategory } from "@carlwr/zsh-core/taxonomy"
import { makeToolDef, type ToolDef } from "../tool-defs.ts"
import { type BaseMatch, entries } from "./entries.ts"
import { clampLimit, DEFAULT_LIMIT, MAX_LIMIT } from "./limits.ts"
import { mkOutputSchema } from "./output-schema.ts"
import { categoryList, type Envelope, mkEnvelope } from "./result.ts"

export interface ListInput {
  readonly category?: DocCategory
  readonly limit?: number
}

export type ListMatch = BaseMatch
export type ListResult = Envelope<ListMatch>

/**
 * Enumerate corpus records (optional category filter). Id/display only — no
 * markdown. `limit=0` → metadata only. Pure; no IO.
 */
export function list(corpus: DocCorpus, input: ListInput): ListResult {
  const limit = clampLimit(input.limit)
  const pool = entries(corpus, input.category)
  return mkEnvelope(pool.slice(0, limit), pool.length)
}

const catList = categoryList()

export const listToolDef: ToolDef = makeToolDef({
  name: "zsh_list",
  brief: "enumerate corpus records (id-only; no markdown)",
  description: `\
Enumerate records from the bundled static zsh reference. Identifiers only — pair with \`zsh_docs\` for the rendered markdown body.

Listing is corpus-iteration order; default category order when \`category\` is omitted, or the single category's iteration order when set.

Each match is \`{ category, id, display, subKind? }\`. \`subKind\` is surfaced when the category has a meaningful sub-facet (e.g. history \`kind\`, glob_op \`kind\`, reserved_word \`pos\`).

\`limit\` caps response size (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT} = entire corpus). \`limit=0\` returns metadata only (\`matches: []\`); the response always carries \`matchesReturned\` (== \`matches.length\`) and \`matchesTotal\` (pre-truncation total), so \`matchesReturned < matchesTotal\` signals truncation — raise \`limit\` or narrow \`category\` to see the rest.

Valid \`category\` values:

${catList}

Unknown \`category\` yields an empty match set.

No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: `Optional filter to a single doc category. Unknown categories yield an empty match set.\n\nValid values:\n\n${catList}`,
      },
      limit: {
        type: "integer",
        minimum: 0,
        maximum: MAX_LIMIT,
        default: DEFAULT_LIMIT,
        description: `Maximum matches to return. Default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT} (entire corpus). \`limit=0\` returns metadata only.\n\nThe response carries \`matchesReturned\` (== \`matches.length\`) and \`matchesTotal\` (pre-truncation total); \`matchesReturned < matchesTotal\` signals truncation — raise \`limit\` or narrow \`category\`.`,
      },
    },
    additionalProperties: false,
  },
  outputSchema: mkOutputSchema({}),
  flagBriefs: {
    category: "Filter to one doc category.",
    limit: `Max matches to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
  },
  execute: (corpus, input): ListResult =>
    list(corpus, input as unknown as ListInput),
})
