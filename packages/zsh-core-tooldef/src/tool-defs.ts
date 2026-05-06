import type { DocCorpus } from "@carlwr/zsh-core"
import { docsToolDef, listToolDef, searchToolDef } from "./tools/index.ts"

/** JSON Schema object as shipped to MCP/LM clients; opaque to this package. */
export type ToolInputSchema = Readonly<Record<string, unknown>>

/**
 * Metadata + runtime for one MCP/LM tool. `execute` receives JSON input
 * already validated against `inputSchema` by the adapter.
 *
 * `brief` is a ≤50-char line for narrow UIs (CLI commands column, list rows);
 * `description` is long-form for LLM selection and full help. Hosts that only
 * need long form ignore `brief`.
 *
 * `flagBriefs` is a ≤60-char line per `inputSchema.properties` key for CLI
 * flag columns. Hosts that only need long form use
 * `inputSchema.properties[key].description`. Keys must match the schema
 * property keys exactly.
 */
export interface ToolDef {
  readonly name: string
  readonly brief: string
  readonly description: string
  readonly inputSchema: ToolInputSchema
  /**
   * JSON Schema for this tool's `execute` return value. Co-located with
   * `inputSchema` for adapters (MCP output, CLI schema) and drift tests.
   * Rationale: `DESIGN.md` (tooldef-owned output schemas).
   */
  readonly outputSchema: ToolInputSchema
  readonly flagBriefs: Readonly<Record<string, string>>
  readonly execute: (corpus: DocCorpus, input: ToolInputSchema) => unknown
}

/** Max character length for `ToolDef.brief`. */
export const BRIEF_MAX_LEN = 50

/** Max character length for any single `ToolDef.flagBriefs` entry. */
export const FLAG_BRIEF_MAX_LEN = 60

/**
 * JSON Schema property fragment for tool `inputSchema` definitions — wide
 * enough for usual metadata, narrow enough for the builder to infer keys.
 */
interface PropertySpec {
  readonly type?: "string" | "integer" | "number" | "boolean"
  readonly description?: string
  readonly enum?: readonly string[]
  readonly minimum?: number
  readonly maximum?: number
  readonly default?: number | string | boolean
}

/**
 * `inputSchema` shape keyed by property union `K`. Lets `buildToolDef` type
 * `flagBriefs` and `required` against those keys at compile time.
 */
interface SchemaFor<K extends string> {
  readonly type: "object"
  readonly properties: Readonly<Record<K, PropertySpec>>
  readonly required?: readonly K[]
  readonly additionalProperties?: boolean
}

export interface FlagProse {
  readonly brief: string
  readonly long: string
}

/** `K` totality enforces flag-key/schema-key coupling at call sites. */
export interface ToolProse<K extends string> {
  readonly brief: string
  readonly long: string
  readonly flags: Readonly<Record<K, FlagProse>>
}

/** JSON Schema fragment without `description` — prose merges in at build. */
export interface FieldShape {
  readonly type?: "string" | "integer" | "number" | "boolean"
  readonly enum?: readonly string[]
  readonly minimum?: number
  readonly maximum?: number
  readonly default?: number | string | boolean
}

export interface SchemaShape<K extends string> {
  readonly type: "object"
  readonly properties: Readonly<Record<K, FieldShape>>
  readonly required?: readonly K[]
  readonly additionalProperties?: boolean
}

/** Compose `ToolDef` from prose + structural shape; `K` couples flag keys. */
export function buildToolDef<K extends string>(args: {
  readonly name: string
  readonly prose: ToolProse<K>
  readonly shape: SchemaShape<K>
  readonly outputSchema: ToolInputSchema
  readonly execute: (corpus: DocCorpus, input: ToolInputSchema) => unknown
}): ToolDef {
  const properties: Record<string, PropertySpec> = {}
  for (const k of Object.keys(args.shape.properties) as K[]) {
    properties[k] = {
      ...args.shape.properties[k],
      description: args.prose.flags[k].long,
    }
  }
  const inputSchema: SchemaFor<K> = {
    type: "object",
    properties: properties as Record<K, PropertySpec>,
    ...(args.shape.required ? { required: args.shape.required } : {}),
    ...(args.shape.additionalProperties !== undefined
      ? { additionalProperties: args.shape.additionalProperties }
      : {}),
  }
  const flagBriefs = Object.fromEntries(
    (Object.keys(args.prose.flags) as K[]).map(k => [
      k,
      args.prose.flags[k].brief,
    ]),
  ) as Record<K, string>
  return {
    name: args.name,
    brief: args.prose.brief,
    description: args.prose.long,
    inputSchema,
    outputSchema: args.outputSchema,
    flagBriefs,
    execute: args.execute,
  } as unknown as ToolDef
}

export { docsToolDef, listToolDef, searchToolDef }

/** All tools in declaration order for adapter registration. */
export const toolDefs: readonly ToolDef[] = [
  docsToolDef,
  searchToolDef,
  listToolDef,
]

// Corpus-tag convention: `zsh_docs` and `zsh_search` name `ZSH_UPSTREAM.tag`
// in their descriptions so agents know which zsh the corpus is. `zsh_list`
// does not repeat the tag (enumeration only; entry tools already set context).

/**
 * Suite-level intent→tool cheat-sheet for hosts that surface suite framing:
 *   - MCP — `instructions` at handshake; often injected as system context.
 *   - Rust `zshref` CLI — concatenated after `prose::rewrite_refs(preamble)`
 *     with `prose::ROOT_AFTER_HELP_TAIL` into the root `--help` tail (tool
 *     names rewritten to subcommands first).
 *
 * The VS Code LM adapter has no server-level slot; per-tool descriptions
 * suffice there.
 *
 * WARNING — DRIFT-PRONE: this string is rendered VERBATIM (modulo the
 * tool-name rewrite) into BOTH an LLM prompt and a terminal user's
 * `--help`. The single-source convenience means edits reach both
 * audiences at once. When editing:
 *   - keep tone neutral enough to read naturally in both a chat context
 *     and a terminal;
 *   - refer to tool parameters by name (e.g. "set `category`"), not as
 *     CLI flag syntax (`--category`) or JSON syntax — `prose::rewrite_refs`
 *     only rewrites tool names, nothing else;
 *   - after editing, run `zshref --help` in a real terminal and check
 *     that the block scans cleanly at ≤80 columns;
 *   - keep it short (terminal users scan; LLM context windows are
 *     finite). Aim for under ~10 lines.
 *
 * Drift-guard tests assert every `zsh_*` name here exists in `toolDefs`;
 * they do not catch tone, length, or formatting — reviewers do.
 */
export const TOOL_SUITE_PREAMBLE: string = `\
Tool → intent:
  \`zsh_docs\`   → look up the docs for a zsh key
  \`zsh_search\` → fuzzy discovery by name
  \`zsh_list\`   → enumerate records in the corpus

  (search, list: id-only; pair with \`zsh_docs\` for the body)
`
