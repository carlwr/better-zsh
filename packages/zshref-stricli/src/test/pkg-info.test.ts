import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { CLI_BIN_NAME, PKG_NAME, PKG_VERSION } from "../pkg-info.ts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"))

describe("pkg-info constants stay in sync with package.json", () => {
  test("PKG_NAME matches package.json.name", () => {
    expect(PKG_NAME).toBe(pkg.name)
  })

  test("PKG_VERSION matches package.json.version", () => {
    expect(PKG_VERSION).toBe(pkg.version)
  })

  test("CLI_BIN_NAME is a key in package.json.bin", () => {
    expect(Object.keys(pkg.bin ?? {})).toContain(CLI_BIN_NAME)
  })
})
