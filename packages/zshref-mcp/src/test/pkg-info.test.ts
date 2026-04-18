import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import {
  MCP_BIN_NAME,
  PKG_NAME,
  PKG_REPO_URL,
  PKG_VERSION,
} from "../pkg-info.ts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const readJson = (file: string) =>
  JSON.parse(readFileSync(join(pkgDir, file), "utf8"))

const pkg = readJson("package.json")
const deno = readJson("deno.json")

// Shared-surface subpaths: must appear in both manifests.
// `./package.json` is npm-only.
const SHARED_EXPORTS = [".", "./server"] as const

describe("pkg-info constants stay in sync with manifests", () => {
  test("PKG_NAME matches package.json.name and deno.json.name", () => {
    expect(PKG_NAME).toBe(pkg.name)
    expect(PKG_NAME).toBe(deno.name)
  })

  test("PKG_VERSION matches package.json.version and deno.json.version", () => {
    expect(PKG_VERSION).toBe(pkg.version)
    expect(PKG_VERSION).toBe(deno.version)
  })

  test("PKG_REPO_URL matches package.json.repository.url", () => {
    expect(PKG_REPO_URL).toBe(pkg.repository?.url)
  })

  test("MCP_BIN_NAME is a key in package.json.bin", () => {
    expect(Object.keys(pkg.bin ?? {})).toContain(MCP_BIN_NAME)
  })
})

describe("shared-surface exports stay in sync", () => {
  test("every shared subpath appears in package.json.exports", () => {
    for (const key of SHARED_EXPORTS) {
      expect(Object.keys(pkg.exports)).toContain(key)
    }
  })
  test("deno.json.exports is exactly the shared subpaths", () => {
    expect(Object.keys(deno.exports).sort()).toEqual([...SHARED_EXPORTS].sort())
  })
})
