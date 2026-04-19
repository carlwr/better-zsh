import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * Structural scope fence for zsh-core's **static** public surface.
 *
 * The `.`, `./render`, and `./assets` entrypoints are advertised as
 * execution-free, network-free, and env-agnostic: they parse bundled
 * Yodl sources and render markdown. The `./exec` entrypoint is excluded
 * — it exposes a `ZshRunner` type; actual shell execution lives in the
 * *consumer*-injected runner, never inside this package, so nothing
 * routed through `./exec` gets to spawn processes either. This test
 * asserts the guarantee structurally by walking the import graph from
 * each static entrypoint and grepping reached files.
 */

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, "..", "..")

const STATIC_ENTRIES = ["index.ts", "render.ts", "assets.ts"] as const

const forbidden = [
  /\bnode:child_process\b/,
  /from ["']child_process["']/,
  /\bnode:dgram\b/,
  /\bnode:net\b/,
  /\bnode:tls\b/,
  /\bnode:https?\b/,
  /\bnode:http2\b/,
  /\bprocess\.env\b/,
] as const

const importPattern = /\bfrom\s+["']([^"']+)["']/g

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null
  const base = resolve(dirname(fromFile), spec)
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    if (spec.endsWith(".ts") || spec.endsWith(".tsx")) return base
    try {
      const candidate = base + ext
      readFileSync(candidate, "utf8")
      return candidate
    } catch {}
  }
  return null
}

function reachable(entries: readonly string[]): Set<string> {
  const seen = new Set<string>()
  const stack = entries.map(e => resolve(pkgDir, e))
  while (stack.length > 0) {
    const file = stack.pop()
    if (file === undefined || seen.has(file)) continue
    seen.add(file)
    let body: string
    try {
      body = readFileSync(file, "utf8")
    } catch {
      continue
    }
    for (const match of body.matchAll(importPattern)) {
      const spec = match[1]
      if (spec === undefined) continue
      const target = resolveImport(file, spec)
      if (target !== null && !seen.has(target)) stack.push(target)
    }
  }
  return seen
}

describe("static-entrypoint scope fence", () => {
  test("reachable files from static entrypoints avoid execution/network/env", () => {
    const files = reachable(STATIC_ENTRIES)
    expect(files.size).toBeGreaterThan(10)
    const violations: string[] = []
    for (const file of files) {
      const body = readFileSync(file, "utf8")
      for (const pat of forbidden) {
        if (pat.test(body)) violations.push(`${file}: ${pat}`)
      }
    }
    expect(violations).toEqual([])
  })

  test("static entrypoints do not reach ./exec", () => {
    const files = reachable(STATIC_ENTRIES)
    const execFile = resolve(pkgDir, "exec.ts")
    const zshFile = resolve(pkgDir, "src", "zsh.ts")
    expect(files.has(execFile)).toBe(false)
    expect(files.has(zshFile)).toBe(false)
  })
})
