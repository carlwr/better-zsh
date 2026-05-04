// MIRRORED-IN: zshref-rs/src/tools/list.rs

import type { DocCorpus } from "@carlwr/zsh-core"
import type { DocCategory } from "@carlwr/zsh-core/taxonomy"
import { makeToolDef, type ToolDef } from "../tool-defs.ts"
import { type BaseMatch, entries } from "./shared/entries.ts"
import { safetyDescription } from "./shared/help.ts"
import { clampLimit, inputSchemaLimit, limitBrief } from "./shared/limits.ts"
import { mkOutputSchema } from "./shared/output-schema.ts"
import {
  briefCategory,
  type Envelope,
  inputSchemaCategory,
  mkEnvelope,
} from "./shared/result.ts"

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

const desc = `\
Return id/display records from the bundled static zsh reference.

Identifiers only. Use \`zsh_docs\` for rendered markdown.

Order:
  category omitted: default category order
  category set: that category's corpus order

Each match in \`matches[]\`:
{
  "category": "...",
  "id": "...",
  "display": "...",
  "subKind": "..."
}

\`subKind\` is only present for categories with a meaningful sub-facet.

${safetyDescription}`

export const listToolDef: ToolDef = makeToolDef<"category" | "limit">({
  name: "zsh_list",
  brief: "enumerate corpus records (id-only; no markdown)",
  description: desc,
  inputSchema: {
    type: "object",
    properties: {
      category: inputSchemaCategory,
      limit: inputSchemaLimit,
    },
    additionalProperties: false,
  },
  outputSchema: mkOutputSchema({}),
  flagBriefs: {
    category: briefCategory,
    limit: limitBrief,
  },
  execute: (corpus, input): ListResult =>
    list(corpus, input as unknown as ListInput),
})
