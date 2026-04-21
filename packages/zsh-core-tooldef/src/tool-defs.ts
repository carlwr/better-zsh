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
