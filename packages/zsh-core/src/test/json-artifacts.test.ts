import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { jsonFiles, schemaFile } from "../docs/json-artifacts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const require = createRequire(import.meta.url)

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(pkgDir, file), "utf8"))

const pkgExports = readJson("package.json").exports as Record<string, unknown>
const denoExports = readJson("deno.json").exports as Record<string, unknown>

describe("json/schema subpath exports stay in sync with jsonFiles", () => {
  test("package.json exposes npm-only export patterns", () => {
    expect(pkgExports["./data/*.json"]).toBe("./dist/json/*.json")
    expect(pkgExports["./schema/*.json"]).toBe("./dist/schema/*.json")

    const exactJsonExports = Object.keys(pkgExports).filter(
      k =>
        (k.startsWith("./data/") || k.startsWith("./schema/")) &&
        !k.includes("*"),
    )
    expect(exactJsonExports).toEqual([])
  })

  test("jsonFiles subpaths resolve through package exports", () => {
    for (const file of jsonFiles) {
      expect(require.resolve(`@carlwr/zsh-core/data/${file}`)).toContain(
        `/dist/json/${file}`,
      )
      expect(
        require.resolve(`@carlwr/zsh-core/schema/${schemaFile(file)}`),
      ).toContain(`/dist/schema/${schemaFile(file)}`)
    }
  })

  test("deno.json omits ./data/* and ./schema/* (npm-only surface)", () => {
    const npmOnly = Object.keys(denoExports).filter(
      k => k.startsWith("./data/") || k.startsWith("./schema/"),
    )
    expect(npmOnly).toEqual([])
  })
})
