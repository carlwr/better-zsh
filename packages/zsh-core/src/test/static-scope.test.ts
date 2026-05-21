import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * Structural scope fence for zsh-core's **static** public surface.
 *
 * Every non-glob `package.json` `exports` subpath (excluding `./exec`) is
 * advertised as execution-free, network-free, and env-agnostic: it parses
 * bundled Yodl sources and renders markdown. `./exec` is excluded — it
 * exposes a `ZshRunner` type; actual shell execution lives in the
 * *consumer*-injected runner, never inside this package. This test walks
 * the import graph from each static entrypoint and greps reached files.
 */

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, "..", "..")

// Derive static entrypoints from package.json so new shared subpaths are
// auto-checked. Excludes: `./exec` (ZshRunner injection), glob patterns
// (data/schema JSON), and the manifest itself.
const EXCLUDED_KEYS: ReadonlySet<string> = new Set(["./exec", "./package.json"])
const pkgExports = (
  JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8")) as {
    exports: Record<string, unknown>
  }
).exports
const STATIC_ENTRIES: readonly string[] = Object.keys(pkgExports)
  .filter(k => !k.includes("*") && !EXCLUDED_KEYS.has(k))
  .map(k => (k === "." ? "index.ts" : `${k.slice(2)}.ts`))

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
  if (spec.endsWith(".ts") || spec.endsWith(".tsx")) return base
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
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

const reached = reachable(STATIC_ENTRIES)

describe("static-entrypoint scope fence", () => {
  test("reachable files from static entrypoints avoid execution/network/env", () => {
    expect(reached.size).toBeGreaterThan(10)
    const violations: string[] = []
    for (const file of reached) {
      const body = readFileSync(file, "utf8")
      for (const pat of forbidden) {
        if (pat.test(body)) violations.push(`${file}: ${pat}`)
      }
    }
    expect(violations).toEqual([])
  })

  test("static entrypoints do not reach ./exec", () => {
    const execFile = resolve(pkgDir, "exec.ts")
    const zshFile = resolve(pkgDir, "src", "exec", "zsh.ts")
    expect(reached.has(execFile)).toBe(false)
    expect(reached.has(zshFile)).toBe(false)
  })
})
