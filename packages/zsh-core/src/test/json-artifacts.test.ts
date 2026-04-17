import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { jsonFiles, schemaFile } from "../docs/json-artifacts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(pkgDir, file), "utf8"))

const pkgExports = readJson("package.json").exports as Record<string, unknown>
const denoExports = readJson("deno.json").exports as Record<string, unknown>

describe("json/schema subpath exports stay in sync with jsonFiles", () => {
  test("package.json ./data/* and ./schema/* entries match jsonFiles exactly", () => {
    const expected = jsonFiles
      .flatMap(file => [`./data/${file}`, `./schema/${schemaFile(file)}`])
      .sort()
    const actual = Object.keys(pkgExports)
      .filter(k => k.startsWith("./data/") || k.startsWith("./schema/"))
      .sort()
    expect(actual).toEqual(expected)
  })

  test("deno.json omits ./data/* and ./schema/* (npm-only surface)", () => {
    const npmOnly = Object.keys(denoExports).filter(
      k => k.startsWith("./data/") || k.startsWith("./schema/"),
    )
    expect(npmOnly).toEqual([])
  })
})
