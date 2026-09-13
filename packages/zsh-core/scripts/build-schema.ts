import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createGenerator } from "ts-json-schema-generator"
import {
  jsonArtifact,
  resolverFixture,
  schemaFile,
} from "../src/docs/json-artifacts.ts"
import { docCategories } from "../src/docs/taxonomy.ts"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(rootDir, "artifacts", "schema")
const fixtureDir = join(rootDir, "artifacts", resolverFixture.dir)
const typePath = join(rootDir, "src", "docs", "json-types.ts")

function fmtJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
// The fixture's schema sits beside the fixture; `build.ts` owns that dir.
mkdirSync(fixtureDir, { recursive: true })

const gen = createGenerator({
  path: typePath,
  tsconfig: join(rootDir, "tsconfig.build.json"),
  expose: "export",
  skipTypeCheck: false,
})

for (const cat of docCategories) {
  const { file, schema } = jsonArtifact[cat]
  writeFileSync(
    join(outDir, schemaFile(file)),
    fmtJson(gen.createSchema(schema)),
    "utf8",
  )
}

writeFileSync(
  join(outDir, "index.schema.json"),
  fmtJson(gen.createSchema("JsonIndex")),
  "utf8",
)

writeFileSync(
  join(fixtureDir, schemaFile(resolverFixture.file)),
  fmtJson(gen.createSchema(resolverFixture.schema)),
  "utf8",
)
