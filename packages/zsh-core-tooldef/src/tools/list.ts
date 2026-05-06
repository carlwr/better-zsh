// MIRRORED-IN: zshref-rs/src/tools/list.rs

import type { DocCorpus } from "@carlwr/zsh-core"
import type { DocCategory } from "@carlwr/zsh-core/taxonomy"
import { buildToolDef, type SchemaShape, type ToolDef } from "../tool-defs.ts"
import { listProse } from "./prose.ts"
import { type BaseMatch, entries } from "./shared/entries.ts"
import { categoryShape, type Envelope, mkEnvelope } from "./shared/envelope.ts"
import { clampLimit, limitShape } from "./shared/limits.ts"
import { mkOutputSchema } from "./shared/output-schema.ts"

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

const listShape: SchemaShape<"category" | "limit"> = {
  type: "object",
  properties: {
    category: categoryShape,
    limit: limitShape,
  },
  additionalProperties: false,
}

export const listToolDef: ToolDef = buildToolDef<"category" | "limit">({
  name: "zsh_list",
  prose: listProse,
  shape: listShape,
  outputSchema: mkOutputSchema({}),
  execute: (corpus, input): ListResult =>
    list(corpus, input as unknown as ListInput),
})
