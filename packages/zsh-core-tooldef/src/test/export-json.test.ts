import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { TOOL_SUITE_PREAMBLE, toolDefs } from "../tool-defs.ts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const tooldefJsonPath = join(pkgDir, "dist", "json", "tooldef.json")

interface ToolJson {
  name: string
  brief: string
  description: string
  flagBriefs: Record<string, string>
  inputSchema: Record<string, unknown>
}
interface ToolDefsJson {
  version: 1
  tools: ToolJson[]
  preamble: string
}

describe.runIf(existsSync(tooldefJsonPath))(
  "tooldef.json export artifact",
  () => {
    const payload = JSON.parse(
      readFileSync(tooldefJsonPath, "utf8"),
    ) as ToolDefsJson

    test("version is 1", () => {
      expect(payload.version).toBe(1)
    })

    test("tool names match toolDefs in order", () => {
      expect(payload.tools.map(t => t.name)).toEqual(toolDefs.map(t => t.name))
    })

    test("no tool carries an `execute` key", () => {
      for (const t of payload.tools) {
        expect(t).not.toHaveProperty("execute")
      }
    })

    test("paragraph-break structure preserved (at least one blank line per tool)", () => {
      for (const t of payload.tools) {
        expect(t.description).toMatch(/\n\n/)
      }
    })

    test("flagBriefs keys equal inputSchema.properties keys", () => {
      for (const t of payload.tools) {
        const schemaProps = Object.keys(
          (t.inputSchema as { properties: Record<string, unknown> }).properties,
        ).sort()
        const flagKeys = Object.keys(t.flagBriefs).sort()
        expect(flagKeys).toEqual(schemaProps)
      }
    })

    test("preamble round-trips from the source constant", () => {
      expect(payload.preamble).toBe(TOOL_SUITE_PREAMBLE)
    })
  },
)
