import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  type CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import type { DocCorpus } from "zsh-core"
import { MCP_BIN_NAME, PKG_VERSION } from "../pkg-info.ts"
import { type ToolDef, type ToolInputSchema, toolDefs } from "../tool-defs.ts"

export interface BuildServerOpts {
  readonly corpus: DocCorpus
  readonly name?: string
  readonly version?: string
}

/**
 * Construct an MCP `Server` with the zsh-ref tool set registered.
 *
 * The returned server is not yet connected to any transport — callers pick
 * stdio (typical), in-memory (tests), or other.
 */
export function buildServer(opts: BuildServerOpts): Server {
  const server = new Server(
    {
      name: opts.name ?? MCP_BIN_NAME,
      version: opts.version ?? PKG_VERSION,
    },
    { capabilities: { tools: {} } },
  )

  const defByName = new Map<string, ToolDef>(
    toolDefs.map(def => [def.name, def]),
  )

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: toolDefs.map(def => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, (req: CallToolRequest) => {
    const def = defByName.get(req.params.name)
    if (!def) {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool: ${req.params.name}` }],
      }
    }
    try {
      const input = (req.params.arguments ?? {}) as ToolInputSchema
      const result = def.execute(opts.corpus, input)
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { isError: true, content: [{ type: "text", text: msg }] }
    }
  })

  return server
}
