import type { DocCorpus } from "@carlwr/zsh-core"
import {
  classifyToolDef,
  describeToolDef,
  lookupOptionToolDef,
  searchToolDef,
} from "./tools/index.ts"

/** JSON Schema object as shipped to MCP/LM clients; opaque to this package. */
export type ToolInputSchema = Readonly<Record<string, unknown>>

/**
 * Metadata + runtime for one MCP/LM tool. `execute` receives a JSON input
 * already validated against `inputSchema` by the adapter layer.
 *
 * `brief` is a ≤50-char one-line summary for narrow rendering contexts
 * (CLI help commands-column, UI list rows); `description` is the long-form
 * prose shown in LLM tool selection / full help blocks. Consumers that
 * don't need a short form (MCP, LM) ignore `brief`.
 *
 * `flagBriefs` mirrors `brief` at the per-flag level: a ≤60-char one-line
 * phrase per `inputSchema.properties` key, for CLI flag-column rendering.
 * Consumers that don't need short forms (MCP, LM) ignore `flagBriefs` and
 * read `inputSchema.properties[key].description` instead — the long form
 * is the source of truth for LLM-facing docs. Keys must match the
 * schema's property keys exactly.
 */
export interface ToolDef {
  readonly name: string
  readonly brief: string
  readonly description: string
  readonly inputSchema: ToolInputSchema
  readonly flagBriefs: Readonly<Record<string, string>>
  readonly execute: (corpus: DocCorpus, input: ToolInputSchema) => unknown
}

/** Max character length for `ToolDef.brief`. */
export const BRIEF_MAX_LEN = 50

/** Max character length for any single `ToolDef.flagBriefs` entry. */
export const FLAG_BRIEF_MAX_LEN = 60

/**
 * JSON-Schema property spec accepted by tool schemas. Keeps the type
 * narrow enough for the builder below to infer property keys while
 * allowing the usual JSON Schema metadata fields on each property.
 */
export interface PropertySpec {
  readonly type?: "string" | "integer" | "number" | "boolean"
  readonly description?: string
  readonly minimum?: number
  readonly maximum?: number
}

/**
 * Shape of an `inputSchema` parameterized by its property key union `K`.
 * Used by `makeToolDef` to propagate key identities into `flagBriefs`
 * and the `required` list so TypeScript can check them at compile time.
 */
export interface SchemaFor<K extends string> {
  readonly type: "object"
  readonly properties: Readonly<Record<K, PropertySpec>>
  readonly required?: readonly K[]
  readonly additionalProperties?: boolean
}

export interface MakeToolDefArgs<K extends string> {
  readonly name: string
  readonly brief: string
  readonly description: string
  readonly inputSchema: SchemaFor<K>
  readonly flagBriefs: Readonly<Record<K, string>>
  readonly execute: (corpus: DocCorpus, input: ToolInputSchema) => unknown
}

/**
 * Build a `ToolDef` with compile-time coupling between the input schema's
 * property keys and the `flagBriefs` / `required` entries:
 *
 *   - Missing `flagBriefs[key]` for any schema property → TS error
 *     (Record<K, string> is total over K).
 *   - Extra `flagBriefs` key not in the schema → TS error (object
 *     literal freshness).
 *   - `required: ["bogus"]` where "bogus" is not a schema property → TS
 *     error (the `readonly K[]` bound forbids non-K strings).
 *
 * This replaces a runtime shape test that used to enforce the same
 * invariants. Adapters still see the erased `ToolDef` (the `K` type
 * parameter is intentionally not exposed — adapters walk `toolDefs`
 * without knowing per-tool key unions).
 */
export function makeToolDef<K extends string>(
  args: MakeToolDefArgs<K>,
): ToolDef {
  // The cast widens `SchemaFor<K>` to `ToolInputSchema` (opaque JSON
  // Schema object) for the erased surface — adapters don't rely on the
  // narrowed key union; they walk the schema generically.
  return args as unknown as ToolDef
}

export { classifyToolDef, describeToolDef, lookupOptionToolDef, searchToolDef }

/** Aggregate list used by adapters to walk all tools uniformly. */
export const toolDefs: readonly ToolDef[] = [
  classifyToolDef,
  lookupOptionToolDef,
  searchToolDef,
  describeToolDef,
]

// Corpus-tag naming convention: the two entry-point tools
// (`zsh_classify`, `zsh_search`) name the vendored upstream tag
// (`ZSH_UPSTREAM.tag`) in their description so an agent learns which
// zsh the answers describe. The follow-up tools (`zsh_describe`,
// `zsh_lookup_option`) deliberately do NOT — they're called after
// discovery, so repeating the tag there only dilutes per-turn
// context. Keep it asymmetric.

/**
 * Suite-level intent→tool cheat-sheet consumed by adapters that have a
 * place to surface suite-level framing:
 *   - MCP (`@carlwr/zshref-mcp`) — passed as `Server` `instructions` at
 *     handshake; clients typically inject it as system context for the
 *     LLM.
 *   - Rust CLI (`zshref-rs`) — inlined into `zshref --help`'s
 *     `ROOT_AFTER_HELP` after `cli_prose()` rewrites `zsh_*` tool names
 *     to `zshref *` subcommand names.
 *
 * The VS Code LM adapter has no server-level slot and does not consume
 * this field; per-tool descriptions already route between tools there.
 *
 * WARNING — DRIFT-PRONE: this string is rendered VERBATIM (modulo the
 * tool-name rewrite) into BOTH an LLM prompt and a terminal user's
 * `--help`. The single-source convenience means edits reach both
 * audiences at once. When editing:
 *   - keep tone neutral enough to read naturally in both a chat context
 *     and a terminal;
 *   - refer to tool parameters by name (e.g. "set `category`"), not as
 *     CLI flag syntax (`--category`) or JSON syntax — `cli_prose()`
 *     only rewrites tool names, nothing else;
 *   - after editing, run `zshref --help` in a real terminal and check
 *     that the block scans cleanly at ≤80 columns;
 *   - keep it short (terminal users scan; LLM context windows are
 *     finite). Aim for under ~10 lines.
 *
 * The drift-guard test in `tool-defs.test.ts` asserts that every
 * `zsh_*` name mentioned here exists in `toolDefs`; it does NOT catch
 * tone, length, or formatting drift — those are on reviewer eyes.
 */
export const TOOL_SUITE_PREAMBLE: string = `\
Intent → tool:

  - classify an unknown zsh token → \`zsh_classify\`
  - look up a shell option (handles NO_* negation) → \`zsh_lookup_option\`
  - fuzzy discovery by name → \`zsh_search\` (set \`query\`)
  - list every record in a category → \`zsh_search\` (set \`category\`, omit \`query\`)
  - full doc for a known { category, id } → \`zsh_describe\`
`
