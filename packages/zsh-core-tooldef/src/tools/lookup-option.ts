import { type DocCorpus, mkPieceId, resolveOption } from "@carlwr/zsh-core"
import { renderDoc } from "@carlwr/zsh-core/render"
import type { ToolDef } from "../tool-defs.ts"

export interface LookupOptionInput {
  readonly raw: string
}

export interface LookupOptionMatch {
  readonly id: string
  readonly display: string
  /** True when input was `NO_FOO` and `FOO` is the resolved option (zsh option-negation convention). */
  readonly negated: boolean
  readonly markdown: string
}

export type LookupOptionResult =
  | { readonly match: LookupOptionMatch }
  | { readonly match: null }

/**
 * Look up a zsh option by raw user text. Surfaces `negated` so agents can
 * distinguish `setopt AUTO_CD` from `setopt NO_AUTO_CD`. Handles the
 * `NOTIFY` / `NO_NOTIFY` edge case. Pure; no IO.
 */
export function lookupOption(
  corpus: DocCorpus,
  input: LookupOptionInput,
): LookupOptionResult {
  const resolved = resolveOption(corpus, input.raw)
  if (!resolved) return { match: null }
  const rec = corpus.option.get(resolved.id)
  if (!rec) {
    throw new Error(
      `lookup_option: corpus lookup miss for option:${resolved.id}`,
    )
  }
  return {
    match: {
      id: resolved.id as string,
      display: rec.display,
      negated: resolved.negated,
      markdown: renderDoc(corpus, mkPieceId("option", resolved.id)),
    },
  }
}

export const lookupOptionToolDef: ToolDef = {
  name: "zsh_lookup_option",
  brief: "look up a zsh option; handles NO_* negation",
  description: `Look up a zsh shell option (the names used with \`setopt\` / \`unsetopt\`) in the bundled static reference.

Matching is case-insensitive and ignores underscores.

Surfaces \`negated: true\` when the input was \`NO_*\` (e.g. \`NO_AUTO_CD\`) so agents can reason about the state being set, not just the option's identity. Handles the NOTIFY / NO_NOTIFY edge case correctly.

Returns \`{ match: null }\` when the token is not a documented option.

No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      raw: {
        type: "string",
        description:
          'Raw option token as it might appear after `setopt` / `unsetopt`. Example inputs: "AUTO_CD", "autocd", "NO_AUTO_CD", "NOTIFY", "NO_NOTIFY".',
      },
    },
    required: ["raw"],
    additionalProperties: false,
  },
  execute: (corpus, input): LookupOptionResult =>
    lookupOption(corpus, input as unknown as LookupOptionInput),
}
