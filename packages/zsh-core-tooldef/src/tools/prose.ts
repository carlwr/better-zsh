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
Resolvers normalize input forms to canonical records (per-category, rule-based):

  INPUT:            RESOLVED:
                    category  id
  ----------        --------  --------
  ALIASES           option    aliases
  NO_ALIASES        option    aliases  (input-negated)
  %number           job_spec  %number
  %1                job_spec  %number\
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

Input \`key\` and the returned \`id\` may therefore differ; the returned \`id\` is always a valid \`key\` for follow-up lookups and is shell-safe (printable ASCII, no whitespace).

Output object properties:
  matches[]          matched records
  matchesReturned    returned match count
  matchesTotal       total match count

  Each matches[] element is an object with mandatory properties:
    category           doc category
    id                 canonical id
    display            zsh-facing name
    mdBody             rendered markdown
    subKind            optional category facet
    feedback           optional lossy-resolution signal

If no matches, returned matches[] is empty. The exit code is still 0 (success).

${safety}\
`

const search_long = `\
Find candidate records in the bundled static ${ZSH_UPSTREAM.tag} reference by id/display heading.

${resolution}

Ranking:
  1. exact id/display
  2. resolver match
  3. prefix
  4. fuzzy score

The score is 1 for exact/resolver/prefix matches. Fuzzy matches use a score in (0,1).

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
  brief: "zsh token or canonical id (required)",
  long: `zsh token or canonical id (lookup key)

Accepts: raw zsh tokens (\`AUTO_CD\`, \`[[\`, \`%1\`, \`<<<\`, \`> word\`) and canonical ids from prior \`zsh_search\` / \`zsh_list\` (\`autocd\`).

\`id\` values returned by any tool are always valid \`key\` inputs.`,
}

const flag_query: FlagProse = {
  brief: "fuzzy-search string (required)",
  long: "search string matched against ids and display headings\n\nEmpty or whitespace returns no matches; use `zsh_list` to enumerate.",
}

const flag_docs_category: FlagProse = {
  brief: "restrict to one category",
  long: `restrict to one doc category\n\nAt most one match will be returned.\n\nIf omitted, all categories are tried, in the order given below. There will be at most one match per category.\n\nValid values:\n\n${renderedCategoryList}`,
}

const flag_filter_category: FlagProse = {
  brief: "restrict to one category",
  long: `restrict to one doc category\n\nIf omitted, all categories are tried in the order given below.\n\nValid values:\n\n${renderedCategoryList}`,
}

const flag_limit: FlagProse = {
  brief: `max. matches to return (default: ${DEFAULT_LIMIT})`,
  long: `limit the number of matches to return\n\nUse 0 to return only metadata.\n\nDefault: ${DEFAULT_LIMIT}`,
}

// --- assembled -------------------------------------------------------------

export const docsProse: ToolProse<"key" | "category"> = {
  brief: docs_brief,
  long: docs_long,
  flags: { key: flag_key, category: flag_docs_category },
}

export const searchProse: ToolProse<"query" | "category" | "limit"> = {
  brief: search_brief,
  long: search_long,
  flags: {
    query: flag_query,
    category: flag_filter_category,
    limit: flag_limit,
  },
}

export const listProse: ToolProse<"category" | "limit"> = {
  brief: list_brief,
  long: list_long,
  flags: { category: flag_filter_category, limit: flag_limit },
}
