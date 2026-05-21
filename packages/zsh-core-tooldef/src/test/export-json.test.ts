import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import type { ToolDefsJson } from "../export-json.ts"
import { TOOL_SUITE_PREAMBLE, toolDefs } from "../tool-defs.ts"
import { ENVELOPE_REQUIRED_KEYS } from "../tools/shared/envelope.ts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const tooldefJsonPath = join(pkgDir, "dist", "json", "tooldef.json")

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

    test("outputSchema is present and shaped per the contract", () => {
      for (const t of payload.tools) {
        expect(t.outputSchema).toMatchObject({ type: "object" })
        const schema = t.outputSchema as {
          type: string
          required?: readonly string[]
          properties?: Record<string, unknown>
        }
        expect(schema.required).toEqual([...ENVELOPE_REQUIRED_KEYS])
        expect(schema.properties).toBeTypeOf("object")
      }
    })
  },
)
