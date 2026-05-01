/**
 * Structural lock on MCP's "thin adapter" claim: `build-server.ts` may
 * import only from the shared tool surface plus a narrow zsh-core
 * allow-list (corpus loader / types). See DESIGN.md §"Adapters of the
 * shared tool surface".
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))
const buildServer = join(here, "..", "server", "build-server.ts")

const ZSH_CORE_ALLOW = new Set(["DocCorpus"])
const TOOLDEF_ALLOW = new Set([
  "TOOL_SUITE_PREAMBLE",
  "ToolDef",
  "ToolInputSchema",
  "toolDefs",
])

function importedNames(src: string, modulePattern: RegExp): readonly string[] {
  const re = new RegExp(
    String.raw`import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']${modulePattern.source}["']`,
    "g",
  )
  const names: string[] = []
  for (const m of src.matchAll(re)) {
    const inside = m[1] ?? ""
    for (const part of inside.split(",")) {
      const head = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
      if (head) names.push(head.trim())
    }
  }
  return names
}

describe("MCP build-server.ts import whitelist", () => {
  const src = readFileSync(buildServer, "utf8")

  test("zsh-core imports are within the allow-list", () => {
    const names = importedNames(src, /@carlwr\/zsh-core(?!-)/)
    expect(names.filter(n => !ZSH_CORE_ALLOW.has(n))).toEqual([])
  })

  test("zsh-core-tooldef imports are within the allow-list", () => {
    const names = importedNames(src, /@carlwr\/zsh-core-tooldef/)
    expect(names.filter(n => !TOOLDEF_ALLOW.has(n))).toEqual([])
  })

  test("does not import from zsh-core/render or /analysis or /exec", () => {
    expect(src).not.toMatch(/@carlwr\/zsh-core\/(render|analysis|exec)/)
  })
})
