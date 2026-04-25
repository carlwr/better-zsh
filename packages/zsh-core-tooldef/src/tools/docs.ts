import {
  classifyOrder,
  type DocCategory,
  type DocCorpus,
  type DocPieceId,
  type DocRecordMap,
  type Documented,
  docCategories,
  docCategoryLabels,
  mkPieceId,
  resolve,
  resolveOption,
  ZSH_UPSTREAM,
} from "@carlwr/zsh-core"
import { renderDoc } from "@carlwr/zsh-core/render"
import { makeToolDef, type ToolDef } from "../tool-defs.ts"
import { display } from "./doc-display.ts"

export interface DocsInput {
  readonly raw: string
  readonly category?: DocCategory
}

export interface DocsMatch {
  readonly category: DocCategory
  readonly id: string
  readonly display: string
  readonly markdown: string
  /** Present on every option-category match; reflects whether the input was a `NO_*` form. */
  readonly negated?: boolean
}

export interface DocsResult {
  readonly matches: readonly DocsMatch[]
  /** Always equals `matches.length`; emitted for envelope uniformity with `search` / `list`. */
  readonly matchesReturned: number
  /** No truncation in `docs`; always equals `matches.length`. Emitted for envelope uniformity. */
  readonly matchesTotal: number
}

const validCategories = new Set<string>(docCategories)

/**
 * Resolve `raw` against one category using the "direct ∥ resolver, direct
 * preferred" rule:
 *
 *   1. Try `corpus[cat].get(trim(raw))` directly.
 *   2. If that misses, fall back to the per-category resolver.
 *
 * Direct precedence is load-bearing for template-key categories. Without
 * it, `--raw=%number --category=job_spec` would resolve `%number` (a
 * literal corpus key) to `%string` (the resolver's template fallback for
 * non-`%%`/`%+`/`%-`/digit forms), breaking round-trip. Non-template
 * categories don't care: direct misses on `AUTO_CD`, falls to the
 * resolver, which lowercases/strips underscores → `autocd`.
 *
 * See DESIGN.md §"docs: direct ∥ resolver".
 */
function lookupOne(
  corpus: DocCorpus,
  cat: DocCategory,
  raw: string,
): DocPieceId | undefined {
  const trimmed = raw.trim()
  // Direct hit short-circuits the resolver. Brand-mint at this boundary is
  // justified by the runtime `has` check — by construction every corpus
  // key is `Documented<cat>`. The `as ReadonlyMap` widening avoids the
  // distributed-union narrowing of `corpus[cat].has` to `never`.
  const map = corpus[cat] as ReadonlyMap<string, unknown>
  if (trimmed && map.has(trimmed))
    return mkPieceId(cat, trimmed as Documented<typeof cat>)
  return resolve(corpus, cat, raw)
}

function formatMatch(
  corpus: DocCorpus,
  pid: DocPieceId,
  raw: string,
): DocsMatch {
  const rec = corpus[pid.category].get(pid.id as never) as
    | DocRecordMap[typeof pid.category]
    | undefined
  if (!rec) {
    throw new Error(
      `docs: corpus lookup miss for ${pid.category}:${pid.id} — resolver returned a brand that isn't in the corpus map; see zsh-core's docs/corpus.ts resolver table.`,
    )
  }
  const base: DocsMatch = {
    category: pid.category,
    id: pid.id as string,
    display: display(pid.category, rec),
    markdown: renderDoc(corpus, pid),
  }
  if (pid.category !== "option") return base
  // Surface `negated` on every option match. Direct hits land on canonical
  // ids (e.g. `autocd`), which carry no NO_ connotation and are always
  // negated:false; only the resolver's `NO_*`-stripping branch sets it
  // true. `resolveOption` reproduces that classification uniformly.
  const opt = resolveOption(corpus, raw)
  return { ...base, negated: opt?.negated ?? false }
}

/**
 * Look up the docs for a raw zsh token. With `--category`, restricts to
 * that one category (0 or 1 matches). Without, walks `classifyOrder` and
 * returns one match per resolving category — typically 0 or 1, occasionally
 * 2 when overlap categories both resolve (`for` → complex_command +
 * reserved_word; `nocorrect` → precmd + option).
 *
 * Resolution is "direct ∥ resolver, direct preferred"; see `lookupOne`.
 * Pure; no IO.
 */
export function docs(corpus: DocCorpus, input: DocsInput): DocsResult {
  const raw = input.raw
  if (raw.trim().length === 0) {
    return { matches: [], matchesReturned: 0, matchesTotal: 0 }
  }

  if (input.category !== undefined) {
    if (!validCategories.has(input.category)) {
      return { matches: [], matchesReturned: 0, matchesTotal: 0 }
    }
    const pid = lookupOne(corpus, input.category, raw)
    if (!pid) return { matches: [], matchesReturned: 0, matchesTotal: 0 }
    const m = formatMatch(corpus, pid, raw)
    return { matches: [m], matchesReturned: 1, matchesTotal: 1 }
  }

  const matches: DocsMatch[] = []
  for (const cat of classifyOrder) {
    const pid = lookupOne(corpus, cat, raw)
    if (pid) matches.push(formatMatch(corpus, pid, raw))
  }
  return {
    matches,
    matchesReturned: matches.length,
    matchesTotal: matches.length,
  }
}

const humanCategoryList: string = classifyOrder
  .map(c => `  - '${c}'  (${docCategoryLabels[c]})`)
  .join("\n")

export const docsToolDef: ToolDef = makeToolDef<"raw" | "category">({
  name: "zsh_docs",
  brief: "look up docs for a raw zsh token (markdown body)",
  description: `\
Look up the docs for a raw zsh token in the bundled static ${ZSH_UPSTREAM.tag} reference.

Returns one match per category that resolves the input, each with the rendered markdown body.

Categories searched (in classify-walk order):

${humanCategoryList}

Set \`category\` to constrain the search to one category; otherwise every category is tried and the response may carry more than one match. Some inputs name elements in more than one category (e.g. \`for\`, \`[[\`, \`function\`, \`nocorrect\`); without \`category\` those return multiple matches.

Each match is \`{ category, id, display, markdown }\`. Option matches additionally carry \`negated: true|false\` so agents can distinguish \`setopt AUTO_CD\` from \`setopt NO_AUTO_CD\` (handles the NOTIFY / NO_NOTIFY edge case).

Resolution is corpus-aware: case-insensitive option matching, underscore stripping, redirection group-op + tail decomposition, history event-designators, and the option \`NO_*\` negation convention. Canonical record ids (e.g. \`autocd\`) round-trip exactly.

Returns \`{ matches: [], matchesReturned: 0, matchesTotal: 0 }\` when nothing resolves. \`matchesReturned\` and \`matchesTotal\` are emitted for envelope uniformity with \`zsh_search\` / \`zsh_list\`; \`docs\` never truncates, so they always equal \`matches.length\`.

No shell execution, no environment access.`,
  inputSchema: {
    type: "object",
    properties: {
      raw: {
        type: "string",
        description:
          'The raw token as it might appear in zsh source — e.g. "AUTO_CD", "echo", "[[", "<<<", "!$", "%1", "NO_NOTIFY", or a canonical id from a prior `zsh_search` such as "autocd". Case and underscores are normalized per category.',
      },
      category: {
        type: "string",
        description: `Optional: constrain the lookup to one category. When omitted, every category is tried and the response may carry more than one match. Unknown values yield an empty match set.\n\nValid values:\n\n${humanCategoryList}`,
      },
    },
    required: ["raw"],
    additionalProperties: false,
  },
  flagBriefs: {
    raw: "Raw zsh token to look up (e.g. AUTO_CD, echo, [[, %1).",
    category: "Optional: constrain to one doc category.",
  },
  execute: (corpus, input): DocsResult =>
    docs(corpus, input as unknown as DocsInput),
})
