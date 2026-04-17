import type { DocCorpus } from "zsh-core"
import {
  type ClassifyInput,
  type ClassifyResult,
  classify,
  type DescribeInput,
  type DescribeResult,
  describe,
  type LookupOptionInput,
  type LookupOptionResult,
  lookupOption,
  type SearchInput,
  type SearchResult,
  search,
} from "./tools/index.ts"

/**
 * JSON Schema object as shipped to MCP clients / embedded in the VS Code
 * `contributes.languageModelTools` manifest. Typed as an opaque object here
 * to avoid a transitive dep on json-schema types — callers only consume it
 * as JSON.
 */
export type ToolInputSchema = Readonly<Record<string, unknown>>

/**
 * Metadata + runtime for one MCP/LM tool. `execute` receives a JSON input
 * object already validated against `inputSchema` by the adapter layer (MCP
 * SDK validates per tool listing; VS Code does the same for LM tools), so
 * the implementation may narrow with a single unchecked cast at the top.
 *
 * Adapters iterate `toolDefs` uniformly and route JSON in / JSON out. The
 * strongly-typed `classify` / `lookupOption` functions remain exported for
 * direct in-process use by TypeScript consumers.
 */
export interface ToolDef {
  readonly name: string
  readonly description: string
  readonly inputSchema: ToolInputSchema
  readonly execute: (corpus: DocCorpus, input: ToolInputSchema) => unknown
}

export const classifyToolDef: ToolDef = {
  name: "zsh_classify",
  description:
    "Classify a raw zsh token against the bundled static reference. Returns the first matching zsh element (option, builtin, reserved word, redirection, conditional operator, parameter, glob/history/param/subscript flag, precommand modifier, process substitution) with its display form, category, and rendered markdown documentation. Returns { match: null } when the token does not name any documented element. Handles zsh option quirks: case-insensitive matching, underscore stripping, and the NO_* negation convention (without the NOTIFY vs TIFY ambiguity). No shell execution, no environment access.",
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

export const lookupOptionToolDef: ToolDef = {
  name: "zsh_lookup_option",
  description:
    "Look up a zsh shell option (the names used with `setopt` / `unsetopt`) in the bundled static reference. Matching is case-insensitive and ignores underscores. Surfaces `negated: true` when the input was `NO_*` (e.g. `NO_AUTO_CD`) so agents can reason about the state being set, not just the option's identity. Handles the NOTIFY / NO_NOTIFY edge case correctly. Returns { match: null } when the token is not a documented option. No shell execution, no environment access.",
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

export const searchToolDef: ToolDef = {
  name: "zsh_search",
  description:
    "Search the bundled static zsh reference. Fuzzy-matches the query against doc record ids and human display headings across every category (option, builtin, reserved word, redirection, conditional operator, parameter, glob/history/param/subscript flag, precommand modifier, process substitution). Omit `query` to list records (optionally filtered by `category`). Ranking: exact id/display > prefix > fuzzy score. Results carry `{ category, id, display, score? }` but NOT the rendered markdown body — follow up with `zsh_describe` or `zsh_classify` for the full doc. `limit` caps response size (default 20, hard max 100). No shell execution, no environment access.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Optional fuzzy search string matched against ids and display headings. Empty/omitted returns records ordered by corpus iteration, capped by `limit`.",
      },
      category: {
        type: "string",
        description:
          "Optional filter to a single doc category. Valid values are the zsh-core `DocCategory` strings: 'option', 'cond_op', 'builtin', 'precmd', 'shell_param', 'reserved_word', 'redir', 'process_subst', 'subscript_flag', 'param_flag', 'history', 'glob_op', 'glob_flag'. An unknown category yields an empty match set.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "Maximum matches to return. Default 20, hard max 100.",
      },
    },
    additionalProperties: false,
  },
  execute: (corpus, input): SearchResult =>
    search(corpus, input as unknown as SearchInput),
}

export const describeToolDef: ToolDef = {
  name: "zsh_describe",
  description:
    "Fetch the full record for a known `{ category, id }` from the bundled static zsh reference. Returns `{ match: { category, id, display, markdown } }` with the rendered markdown body, or `{ match: null }` when the id is not a member of the given category's corpus. Expects exact canonical ids (typically surfaced by a prior `zsh_search` response); unlike `zsh_classify` / `zsh_lookup_option` it does NOT apply per-category normalization such as NO_* stripping. No shell execution, no environment access.",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description:
          "Doc category (a zsh-core `DocCategory` value) — e.g. 'option', 'builtin', 'cond_op', 'reserved_word'. Unknown values yield { match: null }.",
      },
      id: {
        type: "string",
        description:
          "Canonical id within `category` (e.g. 'autocd' for option, 'echo' for builtin). Must be an exact corpus key — usually obtained from `zsh_search`.",
      },
    },
    required: ["category", "id"],
    additionalProperties: false,
  },
  execute: (corpus, input): DescribeResult =>
    describe(corpus, input as unknown as DescribeInput),
}

/** Aggregate list used by adapters to walk all tools uniformly. */
export const toolDefs: readonly ToolDef[] = [
  classifyToolDef,
  lookupOptionToolDef,
  searchToolDef,
  describeToolDef,
]
