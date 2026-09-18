import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createGenerator, type Schema } from "ts-json-schema-generator"
import { loadCorpus } from "../src/docs/corpus.ts"
import {
  fmtJson,
  recordsSchemaFile,
  resolverFixture,
  schemaFile,
} from "../src/docs/json-artifacts.ts"
import { docCategories, subKindEnums } from "../src/docs/taxonomy.ts"
import { PKG_REPO_URL } from "../src/meta/pkg-info.ts"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(rootDir, "artifacts", "schema")
const fixtureDir = join(rootDir, "artifacts", resolverFixture.dir)
const typePath = join(rootDir, "src", "docs", "json-types.ts")

// The generator emits draft-07; the shipped schemas are draft 2020-12, as the
// crate's tool schemas. The rewrite is mechanical while the generator uses no
// keyword the drafts read differently — the schema tests, which compile the
// output with a 2020-12 validator, would flag one.
const draft = "https://json-schema.org/draft/2020-12/schema"
// An identity, not a location: what `$ref`s into a bundle resolve against.
const schemaId = (file: string) => `${PKG_REPO_URL}/schema/${file}`

type Obj = Record<string, unknown>
type Defs = Record<string, Obj>
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null

function rewriteRefs(node: unknown): void {
  if (Array.isArray(node)) {
    for (const v of node) rewriteRefs(v)
  } else if (isObj(node)) {
    if (typeof node.$ref === "string") {
      node.$ref = node.$ref.replace(/^#\/definitions\//, "#/$defs/")
    }
    for (const v of Object.values(node)) rewriteRefs(v)
  }
}

function toDraft2020(schema: Schema, file: string): Obj {
  const { $ref, definitions } = schema
  if (!$ref || !definitions) {
    throw new Error(`${file}: generator emitted no root $ref / definitions`)
  }
  const out: Obj = {
    $schema: draft,
    $id: schemaId(file),
    $ref,
    $defs: definitions,
  }
  rewriteRefs(out)
  return out
}

/** Record definition a `#/$defs/<name>` reference points at. */
function defOf(defs: Defs, ref: string): { name: string; def: Obj } {
  const name = decodeURIComponent(ref.replace(/^#\/\$defs\//, ""))
  const def = defs[name]
  if (!def) throw new Error(`unresolved $ref ${ref}`)
  return { name, def }
}

/**
 * Per-category `_subKind`: required with the corpus enum where the category
 * has sub-kinds, absent (so `additionalProperties: false` rejects it) where
 * it has none. The type declares an optional string; the corpus invariant
 * ("always-or-never per category") is what makes this precise.
 */
function pinSubKind(record: Obj, values: readonly string[] | undefined): void {
  if (Array.isArray(record.anyOf)) {
    for (const branch of record.anyOf) pinSubKind(branch as Obj, values)
    return
  }
  const props = record.properties as Obj | undefined
  if (!props || !("_subKind" in props)) {
    throw new Error(`record definition without a _subKind property`)
  }
  if (values === undefined) {
    delete props._subKind
  } else {
    props._subKind = { type: "string", enum: [...values] }
    record.required = [...(record.required as string[]), "_subKind"]
  }
}

// Leaked JSDoc of the brand machinery: `Documented<…>` and `Brand<…>` render
// as plain strings and would otherwise each carry the brand's documentation.
function stripBrandDescriptions(defs: Defs): void {
  for (const [name, def] of Object.entries(defs)) {
    if (/^(Documented|Brand)</.test(name)) delete def.description
  }
}

function recordsBundle(gen: ReturnType<typeof createGenerator>): Obj {
  const bundle = toDraft2020(
    gen.createSchema("JsonDocArrayMap"),
    recordsSchemaFile,
  )
  const defs = bundle.$defs as Defs
  const root = defOf(defs, bundle.$ref as string).def
  const rootProps = root.properties as Record<string, Obj>
  const enums = subKindEnums(loadCorpus())
  const seen = new Map<string, string>()

  for (const cat of docCategories) {
    const items = rootProps[cat]?.items as Obj | undefined
    if (typeof items?.$ref !== "string") {
      throw new Error(`${cat}: root property is not an array of $ref items`)
    }
    const { name, def } = defOf(defs, items.$ref)
    const other = seen.get(name)
    if (other)
      throw new Error(`${name} is the record type of ${other} and ${cat}`)
    seen.set(name, cat)
    pinSubKind(def, enums[cat])

    // Hoist: consumers key on `#/$defs/<category>`, not on TS type names.
    if (cat in defs) throw new Error(`$defs already has a "${cat}" entry`)
    defs[cat] = rootProps[cat] as Obj
    rootProps[cat] = { $ref: `#/$defs/${cat}` }
  }
  stripBrandDescriptions(defs)
  return bundle
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

writeFileSync(
  join(outDir, recordsSchemaFile),
  fmtJson(recordsBundle(gen)),
  "utf8",
)

const indexSchema = schemaFile("index.json")
writeFileSync(
  join(outDir, indexSchema),
  fmtJson(toDraft2020(gen.createSchema("JsonIndex"), indexSchema)),
  "utf8",
)

const fixtureSchema = schemaFile(resolverFixture.file)
writeFileSync(
  join(fixtureDir, fixtureSchema),
  fmtJson(toDraft2020(gen.createSchema(resolverFixture.schema), fixtureSchema)),
  "utf8",
)
