import {
  classifyOrder,
  type DocCategory,
  type DocCorpus,
  type DocPieceId,
  type DocRecordMap,
  docCategoryLabels,
  resolve,
} from "zsh-core"
import { renderDoc } from "zsh-core/render"
import type { ToolDef } from "../tool-defs.ts"
import { display } from "./doc-display.ts"

export interface ClassifyInput {
  readonly raw: string
}

export interface ClassifyMatch {
  readonly category: DocCategory
  readonly id: string
  readonly display: string
  readonly markdown: string
}

export type ClassifyResult =
  | { readonly match: ClassifyMatch }
  | { readonly match: null }

/**
 * Classify a raw zsh token against the corpus. Returns the first
 * `classifyOrder` hit, or `{ match: null }`. Pure; no IO.
 */
export function classify(
  corpus: DocCorpus,
  input: ClassifyInput,
): ClassifyResult {
  for (const cat of classifyOrder) {
    const pid = resolve(corpus, cat, input.raw)
    if (pid) return { match: formatMatch(corpus, pid) }
  }
  return { match: null }
}

function formatMatch(corpus: DocCorpus, pid: DocPieceId): ClassifyMatch {
  const rec = corpus[pid.category].get(pid.id as never) as
    | DocRecordMap[typeof pid.category]
    | undefined
  if (!rec) {
    throw new Error(
      `classify: corpus lookup miss for ${pid.category}:${pid.id} — resolver returned a brand that isn't in the corpus map; see zsh-core's docs/corpus.ts resolver table.`,
    )
  }
  return {
    category: pid.category,
    id: pid.id as string,
    display: display(pid.category, rec),
    markdown: renderDoc(corpus, pid),
  }
}

const humanCategoryList = classifyOrder
  .map(c => docCategoryLabels[c])
  .join(", ")

export const classifyToolDef: ToolDef = {
  name: "zsh_classify",
  description: `Classify a raw zsh token against the bundled static reference. Returns the first matching zsh element (categories, in classify order: ${humanCategoryList}) with its display form, category, and rendered markdown documentation. Returns { match: null } when the token does not name any documented element. Handles zsh option quirks: case-insensitive matching, underscore stripping, and the NO_* negation convention (without the NOTIFY vs TIFY ambiguity). No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      raw: {
        type: "string",
        description:
          'The raw token as it might appear in zsh source — e.g. "AUTO_CD", "echo", "[[", "<<<", "!$", "<(...)", "NO_NOTIFY". Case and underscores are normalized per category.',
      },
    },
    required: ["raw"],
    additionalProperties: false,
  },
  execute: (corpus, input): ClassifyResult =>
    classify(corpus, input as unknown as ClassifyInput),
}
