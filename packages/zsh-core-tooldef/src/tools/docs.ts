// MIRRORED-IN: zshref-rs/src/tools/docs.rs

import type { DocCorpus } from "@carlwr/zsh-core"
import { ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
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
import { makeToolDef, type ToolDef } from "../tool-defs.ts"
import { display } from "./shared/doc-display.ts"
import type { BaseMatch } from "./shared/entries.ts"
import { resolutionDescription, safetyDescription } from "./shared/help.ts"
import { mkOutputSchema } from "./shared/output-schema.ts"
import {
  briefCategory,
  type Envelope,
  inputSchemaCategory,
  isValidCategory,
  mkEnvelope,
} from "./shared/result.ts"

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
    if (pid?.category === "history" && !isHistoryEvent(corpus, pid)) continue
    if (pid) matches.push(formatMatch(corpus, pid, key))
  }
  return mkEnvelope(matches)
}

function isHistoryEvent(corpus: DocCorpus, pid: DocPieceId): boolean {
  const rec = corpus.history.get(pid.id as Documented<"history">)
  return rec?.kind === "event-designator"
}

const desc = `\
Render markdown for a zsh token or canonical id from the bundled static ${ZSH_UPSTREAM.tag} reference.

Omitting \`--category\` can return multiple matches for overlapping syntax. The category list under the help for \`--category\` is resolver order.

${resolutionDescription}

Output:
  matches[]          matched records
  matchesReturned    returned match count
  matchesTotal       total match count

Each match:
  category           doc category
  id                 canonical id
  display            zsh-facing name
  mdBody             rendered markdown
  subKind            optional category facet
  feedback           optional lossy-resolution signal

No matches: empty \`matches[]\`, exit code 0. Returned \`id\` values are valid \`--key\` inputs.

${safetyDescription}`

export const docsToolDef: ToolDef = makeToolDef<"key" | "category">({
  name: "zsh_docs",
  brief: "look up bundled zsh reference docs",
  description: desc,
  inputSchema: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: `Zsh token or canonical id\n\nExamples: AUTO_CD, [[, %1, autocd`,
      },
      category: inputSchemaCategory,
    },
    required: ["key"],
    additionalProperties: false,
  },
  outputSchema: mkOutputSchema({
    mdBody: "required",
    feedback: "optional",
  }),
  flagBriefs: {
    key: "Zsh token or canonical id.",
    category: briefCategory,
  },
  execute: (corpus, input): DocsResult =>
    docs(corpus, input as unknown as DocsInput),
})
