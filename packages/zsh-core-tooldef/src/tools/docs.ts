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
import { display } from "./doc-display.ts"
import type { BaseMatch } from "./entries.ts"
import { mkOutputSchema } from "./output-schema.ts"
import {
  categoryList,
  type Envelope,
  isValidCategory,
  mkEnvelope,
} from "./result.ts"

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

const catList = categoryList(classifyOrder, { withLabel: true })

export const docsToolDef: ToolDef = makeToolDef<"key" | "category">({
  name: "zsh_docs",
  brief: "look up docs for a zsh key (markdown body)",
  description: `\
Look up the docs for a zsh key in the bundled static ${ZSH_UPSTREAM.tag} reference.

Returns one match per category that resolves the input, each with the rendered markdown body.

Categories searched (in resolver-walk order):

${catList}

Set \`category\` to constrain the search to one category; otherwise every category is tried and the response may carry more than one match. Some inputs name elements in more than one category (e.g. \`for\`, \`[[\`, \`function\`, \`nocorrect\`); without \`category\` those return multiple matches.

Each match is \`{ category, id, display, mdBody, subKind?, feedback? }\`. \`subKind\` is surfaced when the category has a meaningful sub-facet (e.g. history \`kind\`, glob_op \`kind\`, reserved_word \`pos\`). \`feedback\` is emitted when the per-category resolver had a lossy-normalization signal worth surfacing — today, \`{ kind: "input-negated" }\` on option inputs reached via \`NO_\`-stripping, so agents can distinguish \`setopt AUTO_CD\` from \`setopt NO_AUTO_CD\` (handles the \`NOTIFY\` / \`NO_NOTIFY\` edge case).

Resolution is corpus-aware: case-insensitive option matching, underscore stripping, redirection group-op + tail decomposition, history event-designators, and the option \`NO_*\` negation convention. Canonical record ids (e.g. \`autocd\`) round-trip exactly.

Returns \`{ matches: [], matchesReturned: 0, matchesTotal: 0 }\` when nothing resolves. \`matchesReturned\` and \`matchesTotal\` are emitted for envelope uniformity with \`zsh_search\` / \`zsh_list\`; \`docs\` never truncates, so they always equal \`matches.length\`.

No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description:
          'The zsh token or canonical key to look up — e.g. "AUTO_CD", "echo", "[[", "<<<", "!42", "%1", "NO_NOTIFY", or a canonical id from a prior `zsh_search` such as "autocd". Case and underscores are normalized per category.',
      },
      category: {
        type: "string",
        description: `Optional: constrain the lookup to one category. When omitted, every category is tried and the response may carry more than one match. Unknown values yield an empty match set.\n\nValid values:\n\n${catList}`,
      },
    },
    required: ["key"],
    additionalProperties: false,
  },
  outputSchema: mkOutputSchema({
    mdBody: "required",
    feedback: "optional",
  }),
  flagBriefs: {
    key: "Zsh token or canonical key to look up.",
    category: "Optional: constrain to one doc category.",
  },
  execute: (corpus, input): DocsResult =>
    docs(corpus, input as unknown as DocsInput),
})
