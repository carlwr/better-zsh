import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, test } from "vitest"

/**
 * Structural scope fence for zsh-core's public surface.
 *
 * Every non-glob `package.json` `exports` subpath is advertised as
 * execution-free, network-free, and env-agnostic: it parses bundled Yodl
 * sources and renders markdown. zsh-core never executes a shell — hosts that
 * run a zsh binary own that code (see the extension's `zsh/` modules).
 *
 * Per subpath, only the entries that locate the vendored data may reach the
 * file system at all: importing any other subpath must work where no data
 * sits beside the bundle.
 */

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, "..", "..")

// Derive static entrypoints from package.json so new shared subpaths are
// auto-checked. Excludes glob patterns (data/schema JSON) and the manifest.
const EXCLUDED_KEYS: ReadonlySet<string> = new Set(["./package.json"])
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

// I/O-bearing Node builtins. `node:crypto` is deliberately absent: hashing
// is pure computation.
const IO_BUILTINS: ReadonlySet<string> = new Set([
  "node:fs",
  "node:fs/promises",
  "fs",
  "fs/promises",
  "node:path",
  "path",
  "node:url",
  "url",
  "node:os",
  "os",
  "node:child_process",
  "child_process",
  "node:net",
  "node:http",
  "node:https",
  "node:http2",
  "node:dgram",
  "node:tls",
  "node:process",
])
const ENV_PATTERN = /\bprocess\.env\b/

// The only entries allowed to reach I/O: both locate the vendored data.
const IO_ALLOWED: readonly string[] = ["assets.ts", "index.ts"]

/**
 * Module specifiers a file imports or re-exports. With `valueOnly`,
 * type-only edges (`import type`, `export type`, and specifier lists whose
 * every element is inline `type`) are skipped — they vanish at runtime.
 */
function importSpecs(file: string, valueOnly: boolean): readonly string[] {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  )
  const specs: string[] = []
  for (const st of sf.statements) {
    let spec: ts.Expression | undefined
    let typeOnly = false
    if (ts.isImportDeclaration(st)) {
      spec = st.moduleSpecifier
      const clause = st.importClause
      typeOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            allTypeOnly(clause.namedBindings.elements)))
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
      spec = st.moduleSpecifier
      typeOnly =
        st.isTypeOnly ||
        (st.exportClause !== undefined &&
          ts.isNamedExports(st.exportClause) &&
          allTypeOnly(st.exportClause.elements))
    } else continue
    if (valueOnly && typeOnly) continue
    if (ts.isStringLiteral(spec)) specs.push(spec.text)
  }
  return specs
}

function allTypeOnly(
  elements: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[],
): boolean {
  return elements.length > 0 && elements.every(e => e.isTypeOnly)
}

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

/** Files reachable from `entries` (package-relative) plus the bare specifiers they import. */
function reachable(
  entries: readonly string[],
  valueOnly: boolean,
): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>()
  const bare = new Set<string>()
  const stack = entries.map(e => resolve(pkgDir, e))
  while (stack.length > 0) {
    const file = stack.pop()
    if (file === undefined || files.has(file)) continue
    files.add(file)
    let specs: readonly string[]
    try {
      specs = importSpecs(file, valueOnly)
    } catch {
      continue
    }
    for (const spec of specs) {
      const target = resolveImport(file, spec)
      if (target === null) bare.add(spec)
      else if (!files.has(target)) stack.push(target)
    }
  }
  return { files, bare }
}

// Conservative closure: every edge, type-only ones included.
const reached = reachable(STATIC_ENTRIES, false).files

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

  test("only the data-locating entries reach I/O builtins (value edges)", () => {
    const reachingIo: string[] = []
    for (const entry of STATIC_ENTRIES) {
      const { files, bare } = reachable([entry], true)
      const hits = [...bare].filter(spec => IO_BUILTINS.has(spec))
      for (const file of files) {
        if (ENV_PATTERN.test(readFileSync(file, "utf8")))
          hits.push(`${file}: process.env`)
      }
      if (hits.length > 0) reachingIo.push(entry)
    }
    expect(reachingIo.sort()).toEqual([...IO_ALLOWED].sort())
  })
})
