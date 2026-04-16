import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(here, "..", "..")
const serverEntry = join(pkgDir, "dist", "server.mjs")

const describeIfBuilt = existsSync(serverEntry) ? describe : describe.skip

describeIfBuilt("MCP stdio integration", () => {
  let client: Client
  let transport: StdioClientTransport

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
    })
    client = new Client(
      { name: "zsh-ref-mcp-test-client", version: "0.0.0" },
      { capabilities: {} },
    )
    await client.connect(transport)
  })

  afterAll(async () => {
    await client.close()
  })

  test("tools/list advertises zsh_classify and zsh_lookup_option", async () => {
    const result = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema,
    )
    const names = result.tools.map(t => t.name).sort()
    expect(names).toEqual(["zsh_classify", "zsh_lookup_option"])
    for (const tool of result.tools) {
      expect((tool.description ?? "").length).toBeGreaterThan(40)
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        required: ["raw"],
      })
    }
  })

  test("zsh_classify returns a match for a builtin", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: { name: "zsh_classify", arguments: { raw: "echo" } },
      },
      CallToolResultSchema,
    )
    expect(result.isError).toBeFalsy()
    const text = (result.content[0] as { type: "text"; text: string }).text
    const parsed = JSON.parse(text) as {
      match: { category: string; id: string; markdown: string } | null
    }
    expect(parsed.match?.category).toBe("builtin")
    expect(parsed.match?.id).toBe("echo")
    expect(parsed.match?.markdown).toMatch(/echo/i)
  })

  test("zsh_lookup_option surfaces negation", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "zsh_lookup_option",
          arguments: { raw: "NO_AUTO_CD" },
        },
      },
      CallToolResultSchema,
    )
    const text = (result.content[0] as { type: "text"; text: string }).text
    const parsed = JSON.parse(text) as {
      match: { id: string; negated: boolean } | null
    }
    expect(parsed.match?.id).toBe("autocd")
    expect(parsed.match?.negated).toBe(true)
  })

  test("unknown tool returns isError", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: { name: "does_not_exist", arguments: {} },
      },
      CallToolResultSchema,
    )
    expect(result.isError).toBe(true)
  })

  test("both calls in one spawn (latency sanity)", async () => {
    const a = client.request(
      {
        method: "tools/call",
        params: { name: "zsh_classify", arguments: { raw: "if" } },
      },
      CallToolResultSchema,
    )
    const b = client.request(
      {
        method: "tools/call",
        params: { name: "zsh_classify", arguments: { raw: "AUTO_CD" } },
      },
      CallToolResultSchema,
    )
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.isError).toBeFalsy()
    expect(rb.isError).toBeFalsy()
  })
})
