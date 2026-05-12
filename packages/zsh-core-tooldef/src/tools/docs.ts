// MIRRORED-IN: zshref-rs/src/tools/docs.rs

import type { DocCorpus } from "@carlwr/zsh-core"
import { renderDoc } from "@carlwr/zsh-core/render"
import {
  lookupRaw,
  type ResolverFeedback,
  resolverFeedback,
} from "@carlwr/zsh-core/resolver"
import {
  classifyOrder,
  type DocCategory,
  type DocPieceId,
  type DocRecordMap,
  docSubKind,
} from "@carlwr/zsh-core/taxonomy"
import type { Documented } from "@carlwr/zsh-core/types"
import { buildToolDef, type SchemaShape, type ToolDef } from "../tool-defs.ts"
import { docsProse } from "./prose.ts"
import { display } from "./shared/doc-display.ts"
import type { BaseMatch } from "./shared/entries.ts"
import {
  categoryShape,
  type Envelope,
  isValidCategory,
  mkEnvelope,
} from "./shared/envelope.ts"
import { mkOutputSchema } from "./shared/output-schema.ts"

export interface DocsInput {
  readonly key: string
  readonly category?: DocCategory
}

export interface DocsMatch extends BaseMatch {
  readonly mdBody: string
  /** Optional per-category resolver feedback (e.g. `{ kind: "input-negated" }` when an option was reached via `NO_`-stripping). Absent when there is nothing to surface. */
  readonly feedback?: ResolverFeedback
}

export type DocsResult = Envelope<DocsMatch>

function formatMatch(
  corpus: DocCorpus,
  pid: DocPieceId,
  key: string,
): DocsMatch {
  const rec = corpus[pid.category].get(pid.id as never) as
    | DocRecordMap[typeof pid.category]
    | undefined
  if (!rec) {
    throw new Error(
      `docs: corpus lookup miss for ${pid.category}:${pid.id} — resolver returned an id not present in the corpus map.`,
    )
  }
  const getSubKind = docSubKind[pid.category] as (
    d: DocRecordMap[typeof pid.category],
  ) => string | undefined
  const subKind = getSubKind(rec)
  const fb = resolverFeedback(corpus, pid.category, key)
  return {
    category: pid.category,
    id: pid.id as string,
    display: display(pid.category, rec),
    mdBody: renderDoc(corpus, pid),
    ...(subKind !== undefined ? { subKind } : {}),
    ...(fb !== undefined ? { feedback: fb } : {}),
  }
}

/**
 * Look up docs for a zsh key. With `category`, one category (0–1
 * matches). Without, walks `classifyOrder` and returns one match per
 * resolving category — usually 0–1, sometimes 2 when overlap categories
 * both resolve (`for`, `nocorrect`, etc.).
 *
 * Resolution is `lookupRaw` (direct ∥ resolver, direct preferred). Pure; no IO.
 */
export function docs(corpus: DocCorpus, input: DocsInput): DocsResult {
  const key = input.key
  if (key.trim().length === 0) return mkEnvelope<DocsMatch>([])

  if (input.category !== undefined) {
    if (!isValidCategory(input.category)) return mkEnvelope<DocsMatch>([])
    const pid = lookupRaw(corpus, input.category, key)
    if (!pid) return mkEnvelope<DocsMatch>([])
    return mkEnvelope([formatMatch(corpus, pid, key)])
  }

  const matches: DocsMatch[] = []
  for (const cat of classifyOrder) {
    const pid = lookupRaw(corpus, cat, key)
    if (pid?.category === "history_expn" && !isHistoryEvent(corpus, pid))
      continue
    if (pid) matches.push(formatMatch(corpus, pid, key))
  }
  return mkEnvelope(matches)
}

function isHistoryEvent(corpus: DocCorpus, pid: DocPieceId): boolean {
  const rec = corpus.history_expn.get(pid.id as Documented<"history_expn">)
  return rec?.kind === "event-designator"
}

const docsShape: SchemaShape<"key" | "category"> = {
  type: "object",
  properties: {
    key: { type: "string" },
    category: categoryShape,
  },
  required: ["key"],
  additionalProperties: false,
}

export const docsToolDef: ToolDef = buildToolDef<"key" | "category">({
  name: "zsh_docs",
  prose: docsProse,
  shape: docsShape,
  outputSchema: mkOutputSchema({ mdBody: "required", feedback: "optional" }),
  execute: (corpus, input): DocsResult =>
    docs(corpus, input as unknown as DocsInput),
})
