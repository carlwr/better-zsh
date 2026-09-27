import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { build } from "tsdown"
import { publicEntries } from "./scripts/pkg-entries.ts"
import { buildResolverFixture } from "./scripts/resolver-fixture.ts"
import {
  createSchemaGen,
  fixtureBundle,
  indexBundle,
  recordsBundle,
  resolverFeedbackDef,
} from "./scripts/schemas.ts"
import { docCategoryPreamble } from "./src/docs/category-preamble.ts"
import { loadCorpus } from "./src/docs/corpus.ts"
import {
  fmtJson,
  hashRecords,
  jsonRecordsText,
  recordsFile,
  recordsSchemaFile,
  resolverFixture,
  schemaFile,
} from "./src/docs/json-artifacts.ts"
import type {
  JsonCategoryDescriptor,
  JsonIndex,
} from "./src/docs/json-types.ts"
import {
  classifyOrder,
  type DocCategory,
  docCategories,
  docCategoryLabels,
} from "./src/docs/taxonomy.ts"
import { PKG_VERSION } from "./src/meta/pkg-info.ts"
import { ZSH_UPSTREAM } from "./src/meta/zsh-upstream.ts"

const pkgDir = import.meta.dirname
const distDir = join(pkgDir, "dist")
const jsonDir = join(pkgDir, "artifacts", "json")
const fixtureDir = join(pkgDir, "artifacts", resolverFixture.dir)
const schemaDir = join(pkgDir, "artifacts", "schema")

function writeJson(path: string, data: unknown) {
  writeFileSync(path, fmtJson(data), "utf8")
}

function categoryDescriptor(id: DocCategory): JsonCategoryDescriptor {
  const preamble = docCategoryPreamble[id]
  return {
    id,
    label: docCategoryLabels[id],
    ...(preamble === undefined ? {} : { preamble }),
  }
}

function writeJsonArtifacts() {
  for (const dir of [jsonDir, fixtureDir, schemaDir]) {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
  }

  const corpus = loadCorpus()

  const recordsText = jsonRecordsText(corpus)
  writeFileSync(join(jsonDir, recordsFile), recordsText, "utf8")

  // One generator instance behind every shipped schema; the index carries
  // the fixture schema's `ResolverFeedback` def, so the two never diverge.
  const gen = createSchemaGen(pkgDir)
  const fixtureSchema = fixtureBundle(gen)

  const dataHash = hashRecords(recordsText)
  const index: JsonIndex = {
    version: 7,
    packageVersion: PKG_VERSION,
    zshUpstream: ZSH_UPSTREAM,
    dataHash,
    // Canonical taxonomy metadata, consumed by out-of-process consumers (the
    // Rust crate) as the source of truth — no Rust-side mirror.
    categories: docCategories.map(categoryDescriptor),
    classifyOrder: [...classifyOrder],
    resolverFeedbackSchema: resolverFeedbackDef(fixtureSchema),
  }

  writeJson(join(jsonDir, "index.json"), index)
  writeJson(
    join(fixtureDir, resolverFixture.file),
    buildResolverFixture(corpus, { packageVersion: PKG_VERSION, dataHash }),
  )
  writeJson(join(fixtureDir, schemaFile(resolverFixture.file)), fixtureSchema)
  writeJson(join(schemaDir, recordsSchemaFile), recordsBundle(gen))
  writeJson(join(schemaDir, schemaFile("index.json")), indexBundle(gen))
}

;(async () => {
  await build({
    config: false,
    cwd: pkgDir,
    // One bundle per public entry: a subpath without one resolves to nothing.
    entry: publicEntries(pkgDir).map(name => resolve(pkgDir, `${name}.ts`)),
    outDir: distDir,
    tsconfig: resolve(pkgDir, "tsconfig.build.json"),
    platform: "node",
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
    logLevel: "warn",
  })

  mkdirSync(join(distDir, "data"), { recursive: true })
  cpSync(
    resolve(pkgDir, "src", "data", "zsh-docs"),
    resolve(distDir, "data", "zsh-docs"),
    { recursive: true },
  )
  writeJsonArtifacts()
})()
