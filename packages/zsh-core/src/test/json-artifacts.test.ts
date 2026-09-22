import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { docCategoryPreamble } from "../docs/category-preamble"
import { loadCorpus } from "../docs/corpus"
import {
  hashRecords,
  jsonRecordsText,
  recordsFile,
  recordsSchemaDefs,
  recordsSchemaFile,
  resolverFixture,
  schemaFile,
} from "../docs/json-artifacts"
import type { JsonIndex } from "../docs/json-types"
import {
  classifyOrder,
  docCategories,
  docCategoryLabels,
} from "../docs/taxonomy"

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

  test("the index and the record file are the emitted data files", () => {
    expect(readdirSync(jsonDir).sort()).toEqual(["index.json", recordsFile])
  })

  test("index.json: category descriptors and resolver order", () => {
    const index = readJson("artifacts/json/index.json") as unknown as JsonIndex
    expect(index.version).toBe(7)
    expect(index.categories).toEqual(
      docCategories.map(id => {
        const preamble = docCategoryPreamble[id]
        return {
          id,
          label: docCategoryLabels[id],
          ...(preamble === undefined ? {} : { preamble }),
        }
      }),
    )
    expect(index.classifyOrder).toEqual(classifyOrder)
  })

  // A consumer pairs the record file's entries with `index.categories` by
  // walking both in order (the schema pins the key set, not the order).
  test("records.json: one array per category, in index.categories order", () => {
    const records = readJson(join("artifacts", "json", recordsFile))
    expect(Object.keys(records)).toEqual([...docCategories])
    for (const cat of docCategories) {
      expect(Array.isArray(records[cat]), cat).toBe(true)
    }
  })

  test("one draft 2020-12 records bundle; $defs named by category, never by TS type", () => {
    const bundle = readJson(join("artifacts", "schema", recordsSchemaFile))
    expect(bundle.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    const defs = bundle.$defs as Record<string, unknown>
    for (const cat of docCategories) {
      for (const def of Object.values(recordsSchemaDefs)) {
        expect(defs[def(cat)], def(cat)).toBeDefined()
      }
    }
    expect(Object.keys(defs).filter(name => name.includes("<"))).toEqual([])
    expect(
      existsSync(join(pkgDir, "artifacts", "schema", schemaFile("index.json"))),
    ).toBe(true)
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

  // `ResolverFeedback` ships in two assets — the fixture schema's def and
  // `index.json` — as one generated object: self-contained, one `anyOf`
  // branch per kind closed on its `kind` const, and every kind exercised by
  // the fixture (what a mirror validates its own feedback against).
  test("index.json carries the fixture schema's ResolverFeedback; every kind occurs", () => {
    const index = readJson("artifacts/json/index.json") as unknown as JsonIndex
    const defs = readJson(
      join("artifacts", resolverFixture.dir, schemaFile(resolverFixture.file)),
    ).$defs as Record<string, unknown>
    expect(index.resolverFeedbackSchema).toEqual(defs.ResolverFeedback)
    expect(JSON.stringify(index.resolverFeedbackSchema)).not.toContain('"$ref"')

    const branches = index.resolverFeedbackSchema.anyOf as {
      properties: { kind: { const: string } }
    }[]
    const kinds = branches.map(b => b.properties.kind.const).sort()
    expect(kinds.length).toBeGreaterThan(0)
    const fixture = readJson(
      join("artifacts", resolverFixture.dir, resolverFixture.file),
    ) as { cases: Record<string, { feedback: { kind: string } | null }[]> }
    const seen = new Set(
      Object.values(fixture.cases)
        .flat()
        .map(c => c.feedback?.kind)
        .filter(k => k !== undefined),
    )
    expect([...seen].sort()).toEqual(kinds)
  })

  test("index.dataHash is the SHA-256 of the emitted record file", () => {
    const text = readFileSync(join(jsonDir, recordsFile), "utf8")
    expect(readJson("artifacts/json/index.json").dataHash).toBe(
      hashRecords(text),
    )
    expect(hashRecords(text)).toBe(
      createHash("sha256").update(text).digest("hex"),
    )
  })
})

// Recomputing `dataHash` from source flags artifacts stale against the
// source: wanted under `pnpm qa` (stale upstream output is rebuilt first); a
// mid-iteration `vitest` run before a rebuild fails here.
describe("index.dataHash", () => {
  test("equals the hash of the record file rebuilt from source", () => {
    expect(hashRecords(jsonRecordsText(loadCorpus()))).toBe(
      readJson("artifacts/json/index.json").dataHash,
    )
  })
})
