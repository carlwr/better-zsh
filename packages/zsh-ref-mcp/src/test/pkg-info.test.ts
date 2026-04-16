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

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(here, "..", "..")

const readJson = (file: string) =>
  JSON.parse(readFileSync(join(pkgDir, file), "utf8"))

const pkg = readJson("package.json")
const deno = readJson("deno.json")

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
