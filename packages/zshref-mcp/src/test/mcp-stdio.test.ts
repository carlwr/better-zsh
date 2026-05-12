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
import Ajv2020 from "ajv/dist/2020.js"
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
      // Every tool advertises an `outputSchema` describing its result
      // envelope (matches/matchesReturned/matchesTotal).
      expect(tool.outputSchema).toMatchObject({ type: "object" })
    }
    const search = result.tools.find(t => t.name === "zsh_search")
    expect(search?.outputSchema).toMatchObject({
      type: "object",
      properties: { matches: { type: "array" } },
    })
  })

  test("zsh_docs returns a match for a builtin", async () => {
    const result = await callTool("zsh_docs", { key: "echo" })
    expect(result.isError).toBeFalsy()
    const parsed = parseText(result) as {
      matches: Array<{ category: string; id: string; mdBody: string }>
      matchesReturned: number
      matchesTotal: number
    }
    expect(parsed.matches[0]?.category).toBe("builtin")
    expect(parsed.matches[0]?.id).toBe("echo")
    expect(parsed.matches[0]?.mdBody).toMatch(/echo/i)
    expect(parsed.matchesReturned).toBe(parsed.matchesTotal)
  })

  test("zsh_docs surfaces NO_* option negation via feedback", async () => {
    const result = await callTool("zsh_docs", {
      key: "NO_AUTO_CD",
      category: "option",
    })
    const parsed = parseText(result) as {
      matches: Array<{ id: string; feedback?: { kind: string } }>
    }
    expect(parsed.matches[0]?.id).toBe("autocd")
    expect(parsed.matches[0]?.feedback).toEqual({ kind: "input-negated" })
  })

  test("zsh_search returns matches without mdBody", async () => {
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
        mdBody?: string
      }>
    }
    expect(parsed.matches.length).toBeGreaterThan(0)
    expect(parsed.matches[0]?.id).toBe("echo")
    for (const m of parsed.matches) expect(m.mdBody).toBeUndefined()
  })

  test("zsh_list enumerates a category", async () => {
    const result = await callTool("zsh_list", {
      category: "precmd_modifier",
      limit: 100,
    })
    expect(result.isError).toBeFalsy()
    const parsed = parseText(result) as {
      matches: Array<{ category: string; id: string; mdBody?: string }>
      matchesTotal: number
    }
    expect(parsed.matches.length).toBeGreaterThan(0)
    for (const m of parsed.matches) {
      expect(m.category).toBe("precmd_modifier")
      expect(m.mdBody).toBeUndefined()
    }
  })

  test("zsh_docs rejects unknown key without crashing", async () => {
    const result = await callTool("zsh_docs", { key: "not_a_thing_qq" })
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
      callTool("zsh_docs", { key: "if" }),
      callTool("zsh_docs", { key: "AUTO_CD" }),
    ])
    expect(ra.isError).toBeFalsy()
    expect(rb.isError).toBeFalsy()
  })

  test("tools/call success carries structuredContent alongside text", async () => {
    const result = await callTool("zsh_search", {
      query: "echo",
      category: "builtin",
      limit: 5,
    })
    expect(result.isError).toBeFalsy()
    // text fallback content kept for older clients
    expect(result.content[0]).toMatchObject({ type: "text" })
    // structured object available for schema-aware clients
    const structured = result.structuredContent as {
      matches: Array<{ category: string; id: string; score: number }>
      matchesReturned: number
      matchesTotal: number
    }
    expect(structured).toBeDefined()
    expect(Array.isArray(structured.matches)).toBe(true)
    expect(typeof structured.matchesReturned).toBe("number")
    expect(typeof structured.matchesTotal).toBe("number")
    expect(structured.matches[0]?.id).toBe("echo")
    // structuredContent mirrors the text payload (same JSON, not stringified)
    expect(structured).toEqual(parseText(result))
  })

  test("structuredContent validates against the tool's outputSchema", async () => {
    const list = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema,
    )
    const ajv = new Ajv2020({ allErrors: true, strict: false })
    const schemaByName = new Map<string, object>()
    for (const t of list.tools) {
      if (t.outputSchema) schemaByName.set(t.name, t.outputSchema)
    }

    const cases: Array<{ tool: string; args: Record<string, unknown> }> = [
      { tool: "zsh_search", args: { query: "echo", limit: 5 } },
      { tool: "zsh_docs", args: { key: "echo" } },
      { tool: "zsh_list", args: { category: "builtin", limit: 5 } },
    ]
    for (const c of cases) {
      const result = await callTool(c.tool, c.args)
      expect(result.isError).toBeFalsy()
      const schema = schemaByName.get(c.tool)
      expect(schema).toBeDefined()
      const validate = ajv.compile(schema as object)
      const ok = validate(result.structuredContent)
      if (!ok) {
        throw new Error(
          `outputSchema validation failed for ${c.tool}: ${JSON.stringify(validate.errors)}`,
        )
      }
      expect(ok).toBe(true)
    }
  })

  test("error responses do not include structuredContent", async () => {
    const result = await callTool("does_not_exist")
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
  })
})
