import { type DocCorpus, mkPieceId, resolveOption } from "zsh-core"
import { renderDoc } from "zsh-core/render"

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
 * Look up a zsh option by raw user text.
 *
 * Thin wrapper over `resolveOption()` + `renderDoc()`. Surfaces the `negated`
 * signal so agents can distinguish `setopt AUTO_CD` from `setopt NO_AUTO_CD`
 * even though both resolve to the same doc record. Handles the NOTIFY
 * ambiguity via the corpus-aware resolver.
 *
 * Pure function; no IO, no process env.
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
