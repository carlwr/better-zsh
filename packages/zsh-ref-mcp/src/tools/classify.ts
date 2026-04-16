import {
  type DocCategory,
  type DocCorpus,
  type DocPieceId,
  type DocRecordMap,
  docDisplay,
  resolve,
} from "zsh-core"
import { renderDoc } from "zsh-core/render"

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
 * Classify order. Closed-set / literal-identity categories come before
 * `option`, whose resolver applies a `no_`-stripping transform that would
 * otherwise shadow legitimate literal matches (`nocorrect` is a precmd and
 * also resolves as "NO_CORRECT" option with negation; we want precmd first).
 * `redir` is last — its resolver is group-op + tail matching that can
 * loosely accept short tokens.
 */
const classifyOrder: readonly DocCategory[] = [
  "reserved_word",
  "precmd",
  "builtin",
  "cond_op",
  "shell_param",
  "process_subst",
  "param_flag",
  "subscript_flag",
  "glob_flag",
  "glob_op",
  "history",
  "option",
  "redir",
]

/**
 * Classify a raw zsh token against the corpus.
 *
 * Walks categories in `classifyOrder` and dispatches to `resolve()` for
 * each; returns the first match. Literal-identity categories are tried
 * before `option` so that e.g. `nocorrect` resolves as the precmd modifier
 * rather than an option with negation.
 *
 * Pure function; no IO, no process env.
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
    display: docDisplay(pid.category, rec as never),
    markdown: renderDoc(corpus, pid),
  }
}
