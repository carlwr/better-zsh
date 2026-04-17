import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createGenerator } from "ts-json-schema-generator"
import { jsonArtifact, schemaFile } from "../src/docs/json-artifacts.ts"
import { docCategories } from "../src/docs/taxonomy.ts"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(rootDir, "dist", "schema")
const typePath = join(rootDir, "src", "docs", "json-types.ts")

function fmtJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

mkdirSync(outDir, { recursive: true })

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
