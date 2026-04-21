import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { toolDefs } from "../tool-defs.ts"

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

    test("descriptions are flow prose within paragraphs", () => {
      // A paragraph is a blank-line-separated block. Inside a paragraph,
      // non-indented consecutive lines would indicate residual hand-wrapping.
      for (const t of payload.tools) {
        for (const para of t.description.split(/\n{2,}/)) {
          const lines = para.split("\n")
          for (let i = 1; i < lines.length; i++) {
            const prev = lines[i - 1] ?? ""
            const cur = lines[i] ?? ""
            const prevIndented = /^\s/.test(prev)
            const curIndented = /^\s/.test(cur)
            // allow indented-after-indented (adjacent bullets) and indented
            // following non-indented (bullet after intro line). Reject only
            // non-indented following non-indented — that's wrap drift.
            if (!prevIndented && !curIndented) {
              throw new Error(
                `${t.name}: residual hand-wrap in paragraph:\n${para}`,
              )
            }
          }
        }
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
  },
)
