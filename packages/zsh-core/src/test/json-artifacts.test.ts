import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import {
  hashRecordFiles,
  jsonDataFiles,
  jsonFiles,
  resolverFixture,
  schemaFile,
} from "../docs/json-artifacts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const jsonDir = join(pkgDir, "artifacts", "json")

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(pkgDir, file), "utf8"))

const pkgExports = readJson("package.json").exports as Record<string, unknown>
const denoExports = readJson("deno.json").exports as Record<string, unknown>

describe("generated JSON is a release asset, not a registry payload", () => {
  test("no manifest exposes a data or schema subpath", () => {
    for (const exports of [pkgExports, denoExports]) {
      const subpaths = Object.keys(exports).filter(
        k => k.startsWith("./data/") || k.startsWith("./schema/"),
      )
      expect(subpaths).toEqual([])
    }
  })

  test("every jsonFiles entry is emitted with its schema", () => {
    for (const file of jsonFiles) {
      expect(existsSync(join(jsonDir, file))).toBe(true)
      expect(
        existsSync(join(pkgDir, "artifacts", "schema", schemaFile(file))),
      ).toBe(true)
    }
  })

  test("the resolver fixture is emitted with its schema", () => {
    const dir = join(pkgDir, "artifacts", resolverFixture.dir)
    for (const file of [
      resolverFixture.file,
      schemaFile(resolverFixture.file),
    ]) {
      expect(existsSync(join(dir, file))).toBe(true)
    }
    expect(
      readJson(join("artifacts", resolverFixture.dir, resolverFixture.file))
        .dataHash,
    ).toBe(readJson("artifacts/json/index.json").dataHash)
  })

  test("index.dataHash matches the emitted record bytes", () => {
    const texts = new Map(
      jsonDataFiles.map(file => [
        file,
        readFileSync(join(jsonDir, file), "utf8"),
      ]),
    )
    expect(readJson("artifacts/json/index.json").dataHash).toBe(
      hashRecordFiles(texts),
    )
  })
})
