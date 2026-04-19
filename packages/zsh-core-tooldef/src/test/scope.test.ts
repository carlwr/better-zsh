import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * Structural scope fence: the "no execution, no environment access" promise
 * is a product feature of every adapter that walks `toolDefs` (MCP server,
 * CLI, VS Code extension), so enforce it at the source — no tool file may
 * reach for `child_process`, process spawn primitives, networking APIs,
 * `process.env`, `vscode`, or arbitrary `fs`. Adapters (bin entries,
 * server modules) are free to handle transport and stderr; tool files
 * are not.
 */

const here = dirname(fileURLToPath(import.meta.url))
const toolsDir = join(here, "..", "tools")

const forbidden = [
  /\bnode:child_process\b/,
  /from ["']child_process["']/,
  /\bnode:dgram\b/,
  /\bnode:net\b/,
  /\bnode:tls\b/,
  /\bnode:https?\b/,
  /\bnode:http2\b/,
  /from ["']vscode["']/,
  /\bprocess\.env\b/,
] as const

const fsPatterns = [/\bnode:fs\b|from ["']fs["']/] as const

function walkTs(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walkTs(p))
    else if (p.endsWith(".ts")) out.push(p)
  }
  return out
}

function findViolations(patterns: readonly RegExp[]): string[] {
  const violations: string[] = []
  for (const file of walkTs(toolsDir)) {
    const body = readFileSync(file, "utf8")
    for (const pat of patterns) {
      if (pat.test(body)) violations.push(`${file}: ${pat}`)
    }
  }
  return violations
}

describe("scope fence for tool implementations", () => {
  test("tool files do not import execution/network APIs", () => {
    expect(walkTs(toolsDir).length).toBeGreaterThan(0)
    expect(findViolations(forbidden)).toEqual([])
  })

  test("tool files do not import node:fs", () => {
    expect(findViolations(fsPatterns)).toEqual([])
  })
})
