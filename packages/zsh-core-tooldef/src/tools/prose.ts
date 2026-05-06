// Section order: cross-tool comparison over within-tool adjacency.
// Top-level `<tool>_<part>` constants keep multiline literals at col 1.
// No `--option`: leaks to MCP/LM verbatim. Drift guard in tool-defs.test.ts.

import { ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
import {
  classifyOrder,
  type DocCategory,
  docCategoryLabels,
} from "@carlwr/zsh-core/taxonomy"
import type { FlagProse, ToolProse } from "../tool-defs.ts"
import { DEFAULT_LIMIT } from "./shared/limits.ts"

// --- briefs ----------------------------------------------------------------

const docs_brief = "look up bundled zsh reference docs"
const search_brief = "fuzzy-search the zsh reference by id/display"
const list_brief = "enumerate corpus records (id-only; no markdown)"

// --- shared snippets -------------------------------------------------------

const safety = "No shell execution, no environment access."

const resolution = `\
Resolution turns input forms into canonical ids:
  AUTO_CD     -> option/autocd
  NO_AUTO_CD  -> option/autocd (feedback: input-negated)
  %1          -> job_spec/%number\
`

const renderedCategoryList = (() => {
  const cats = classifyOrder
  const width = Math.max(...cats.map(c => c.length))
  const fmt = (c: DocCategory) =>
    `  ${c.padEnd(width)}      ${docCategoryLabels[c]}`
  const heading = "  value\n  -----"
  return `${heading}\n${cats.map(fmt).join("\n")}`
})()

// --- longs -----------------------------------------------------------------

const docs_long = `\
Render markdown for a zsh token or canonical id from the bundled static ${ZSH_UPSTREAM.tag} reference.

Omitting \`category\` can return multiple matches for overlapping syntax. The list under the \`category\` field's description is resolver order.

${resolution}

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

No matches: empty \`matches[]\`, exit code 0. Returned \`id\` values are valid \`key\` inputs.

${safety}\
`

const search_long = `\
Find candidate records in the bundled static ${ZSH_UPSTREAM.tag} reference by id/display heading.

${resolution}

Ranking:
  1. exact id/display
  2. resolved input
  3. prefix
  4. fuzzy score

\`score\` is 1 for exact/resolution/prefix matches. Fuzzy matches use a score in (0,1).

No markdown body. Use \`zsh_docs\` for full docs.

To enumerate without a query, use \`zsh_list\`.

${safety}\
`

const list_long = `\
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

${safety}\
`

// --- flag prose ------------------------------------------------------------

const flag_key: FlagProse = {
  brief: "Zsh token or canonical id.",
  long: `Zsh token or canonical id\n\nExamples: AUTO_CD, [[, %1, autocd`,
}

const flag_query: FlagProse = {
  brief: "fuzzy-search string (required)",
  long: "Search string matched against ids and display headings. Empty or whitespace returns no matches; use `zsh_list` to enumerate.",
}

const flag_category: FlagProse = {
  brief: "restrict to one category",
  long: `Restrict to one doc category. At most one match will be returned.\n\nIf omitted, all categories are tried, in the order given below. There will be at most one match per category.\n\nValid values:\n\n${renderedCategoryList}`,
}

const flag_limit: FlagProse = {
  brief: `max. matches to return (default: ${DEFAULT_LIMIT})`,
  long: `Limit the number of matches to return.\n\nUse 0 to return only metadata.\n\nDefault: ${DEFAULT_LIMIT}`,
}

// --- assembled -------------------------------------------------------------

export const docsProse: ToolProse<"key" | "category"> = {
  brief: docs_brief,
  long: docs_long,
  flags: { key: flag_key, category: flag_category },
}

export const searchProse: ToolProse<"query" | "category" | "limit"> = {
  brief: search_brief,
  long: search_long,
  flags: { query: flag_query, category: flag_category, limit: flag_limit },
}

export const listProse: ToolProse<"category" | "limit"> = {
  brief: list_brief,
  long: list_long,
  flags: { category: flag_category, limit: flag_limit },
}
