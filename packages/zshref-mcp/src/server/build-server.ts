import type { DocCorpus } from "@carlwr/zsh-core"
import {
  TOOL_SUITE_PREAMBLE,
  type ToolDef,
  type ToolInputSchema,
  toolDefs,
} from "@carlwr/zsh-core-tooldef"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  type CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { MCP_BIN_NAME, PKG_VERSION } from "../meta/pkg-info.ts"

export interface BuildServerOpts {
  readonly corpus: DocCorpus
  readonly name?: string
  readonly version?: string
}

/**
 * Construct an MCP `McpServer` with the zsh-ref tool set registered.
 *
 * The returned server is not yet connected to any transport — callers pick
 * stdio (typical), in-memory (tests), or other.
 */
export function buildServer(opts: BuildServerOpts): McpServer {
  // `instructions` is surfaced at handshake; MCP clients typically inject
  // it as system context for the LLM. Shared across adapters; see the
  // drift warning on `TOOL_SUITE_PREAMBLE` in
  // `@carlwr/zsh-core-tooldef/src/tool-defs.ts`.
  const mcp = new McpServer(
    {
      name: opts.name ?? MCP_BIN_NAME,
      version: opts.version ?? PKG_VERSION,
    },
    {
      capabilities: { tools: {} },
      instructions: TOOL_SUITE_PREAMBLE,
    },
  )
  const { server } = mcp

  const defByName = new Map<string, ToolDef>(
    toolDefs.map(def => [def.name, def]),
  )

  const txtErr = (msg: string) => ({
    isError: true,
    content: [{ type: "text" as const, text: msg }],
  })
  // `structuredContent` is consumed by clients that honor `outputSchema`
  // (SDK ≥1.29, spec 2025-03-26+); the text block is the fallback. Errors
  // omit `structuredContent` — only success responses are schema-validated.
  const txtOk = (json: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }],
    structuredContent: json as Record<string, unknown>,
  })

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: toolDefs.map(def => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      outputSchema: def.outputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, (req: CallToolRequest) => {
    const def = defByName.get(req.params.name)
    if (!def) return txtErr(`unknown tool: ${req.params.name}`)
    try {
      const input = (req.params.arguments ?? {}) as ToolInputSchema
      return txtOk(def.execute(opts.corpus, input))
    } catch (err) {
      return txtErr(err instanceof Error ? err.message : String(err))
    }
  })

  return mcp
}
