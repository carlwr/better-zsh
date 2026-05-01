/**
 * Structural lock on the extension's LM-adapter "thin adapter" claim.
 * `lm-adapter/zsh-ref-tools.ts` is the editor-side sibling of MCP's
 * `build-server.ts`; it must consume the shared tool surface only — never
 * editor-feature primitives (resolve, render, analysis, brands).
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const lmAdapter = join(__dirname, "..", "lm-adapter", "zsh-ref-tools.ts")

const ZSH_CORE_ALLOW = new Set(["DocCorpus"])
const TOOLDEF_ALLOW = new Set(["toolDefs"])

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

describe("extension LM adapter import whitelist", () => {
  const src = readFileSync(lmAdapter, "utf8")

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
