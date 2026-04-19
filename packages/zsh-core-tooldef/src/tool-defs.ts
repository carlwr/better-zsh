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
 */
export interface ToolDef {
  readonly name: string
  readonly description: string
  readonly inputSchema: ToolInputSchema
  readonly execute: (corpus: DocCorpus, input: ToolInputSchema) => unknown
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
