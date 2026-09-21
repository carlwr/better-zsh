import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { docCategoryPreamble } from "../docs/category-preamble"
import { loadCorpus } from "../docs/corpus"
import {
  corpusDataHash,
  hashRecordFiles,
  jsonDataFile,
  jsonDataFiles,
  jsonFiles,
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

  test("every jsonFiles entry is emitted", () => {
    for (const file of jsonFiles) {
      expect(existsSync(join(jsonDir, file))).toBe(true)
    }
  })

  test("index.json: category descriptors and resolver order", () => {
    const index = readJson("artifacts/json/index.json") as unknown as JsonIndex
    expect(index.version).toBe(6)
    expect(index.categories).toEqual(
      docCategories.map(id => {
        const preamble = docCategoryPreamble[id]
        return {
          id,
          file: jsonDataFile(id),
          label: docCategoryLabels[id],
          ...(preamble === undefined ? {} : { preamble }),
        }
      }),
    )
    expect(index.classifyOrder).toEqual(classifyOrder)
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

// `corpusDataHash` recomputes the JSON build's `dataHash` from source, so the
// artifact comparison also flags artifacts stale against the source: wanted
// under `pnpm qa` (stale upstream output is rebuilt first); a mid-iteration
// `vitest` run before a rebuild fails here.
describe("corpusDataHash", () => {
  test("equals the emitted index.dataHash", () => {
    expect(corpusDataHash(loadCorpus())).toBe(
      readJson("artifacts/json/index.json").dataHash,
    )
  })

  test("is deterministic; object identity is irrelevant", () => {
    const corpus = loadCorpus()
    const hash = corpusDataHash(corpus)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(corpusDataHash(corpus)).toBe(hash)
    // `loadCorpus` is cached; a structured clone is a distinct object graph.
    expect(corpusDataHash(structuredClone(corpus))).toBe(hash)
  })

  test("moves with record content", () => {
    const corpus = loadCorpus()
    const option = new Map(
      [...corpus.option].map(([id, rec]) => [
        id,
        { ...rec, desc: `${rec.desc} x` },
      ]),
    )
    expect(corpusDataHash({ ...corpus, option })).not.toBe(
      corpusDataHash(corpus),
    )
  })
})
