import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  type CallToolResult,
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

const parseText = (r: CallToolResult): unknown =>
  JSON.parse((r.content[0] as { type: "text"; text: string }).text)

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(here, "..", "..")
const serverEntry = join(pkgDir, "dist", "server.mjs")

const describeIfBuilt = existsSync(serverEntry) ? describe : describe.skip

describeIfBuilt("MCP stdio integration", () => {
  let client: Client
  let transport: StdioClientTransport

  const callTool = (name: string, args: Record<string, unknown> = {}) =>
    client.request(
      { method: "tools/call", params: { name, arguments: args } },
      CallToolResultSchema,
    )

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
    })
    client = new Client(
      { name: "zshref-mcp-test-client", version: "0.0.0" },
      { capabilities: {} },
    )
    await client.connect(transport)
  })

  afterAll(async () => {
    await client.close()
  })

  test("server instructions surface the suite preamble", () => {
    const instructions = client.getInstructions()
    expect(instructions).toBeDefined()
    expect(instructions).toMatch(/zsh_docs/)
    expect(instructions).toMatch(/zsh_search/)
  })

  test("tools/list advertises the three tools", async () => {
    const result = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema,
    )
    const names = result.tools.map(t => t.name).sort()
    expect(names).toEqual(["zsh_docs", "zsh_list", "zsh_search"])
    for (const tool of result.tools) {
      expect((tool.description ?? "").length).toBeGreaterThan(40)
      expect(tool.inputSchema).toMatchObject({ type: "object" })
    }
  })

  test("zsh_docs returns a match for a builtin", async () => {
    const result = await callTool("zsh_docs", { raw: "echo" })
    expect(result.isError).toBeFalsy()
    const parsed = parseText(result) as {
      matches: Array<{ category: string; id: string; markdown: string }>
      matchesReturned: number
      matchesTotal: number
    }
    expect(parsed.matches[0]?.category).toBe("builtin")
    expect(parsed.matches[0]?.id).toBe("echo")
    expect(parsed.matches[0]?.markdown).toMatch(/echo/i)
    expect(parsed.matchesReturned).toBe(parsed.matchesTotal)
  })

  test("zsh_docs surfaces NO_* option negation", async () => {
    const result = await callTool("zsh_docs", {
      raw: "NO_AUTO_CD",
      category: "option",
    })
    const parsed = parseText(result) as {
      matches: Array<{ id: string; negated: boolean }>
    }
    expect(parsed.matches[0]?.id).toBe("autocd")
    expect(parsed.matches[0]?.negated).toBe(true)
  })

  test("zsh_search returns matches without markdown bodies", async () => {
    const result = await callTool("zsh_search", {
      query: "echo",
      category: "builtin",
      limit: 5,
    })
    expect(result.isError).toBeFalsy()
    const parsed = parseText(result) as {
      matches: Array<{
        category: string
        id: string
        display: string
        markdown?: string
      }>
    }
    expect(parsed.matches.length).toBeGreaterThan(0)
    expect(parsed.matches[0]?.id).toBe("echo")
    for (const m of parsed.matches) expect(m.markdown).toBeUndefined()
  })

  test("zsh_list enumerates a category", async () => {
    const result = await callTool("zsh_list", {
      category: "precmd",
      limit: 100,
    })
    expect(result.isError).toBeFalsy()
    const parsed = parseText(result) as {
      matches: Array<{ category: string; id: string; markdown?: string }>
      matchesTotal: number
    }
    expect(parsed.matches.length).toBeGreaterThan(0)
    for (const m of parsed.matches) {
      expect(m.category).toBe("precmd")
      expect(m.markdown).toBeUndefined()
    }
  })

  test("zsh_docs rejects unknown raw without crashing", async () => {
    const result = await callTool("zsh_docs", { raw: "not_a_thing_qq" })
    expect(result.isError).toBeFalsy()
    expect(parseText(result)).toEqual({
      matches: [],
      matchesReturned: 0,
      matchesTotal: 0,
    })
  })

  test("unknown tool returns isError", async () => {
    const result = await callTool("does_not_exist")
    expect(result.isError).toBe(true)
  })

  test("both calls in one spawn (latency sanity)", async () => {
    const [ra, rb] = await Promise.all([
      callTool("zsh_docs", { raw: "if" }),
      callTool("zsh_docs", { raw: "AUTO_CD" }),
    ])
    expect(ra.isError).toBeFalsy()
    expect(rb.isError).toBeFalsy()
  })
})
