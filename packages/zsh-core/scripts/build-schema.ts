import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createGenerator, type Schema } from "ts-json-schema-generator"
import { displayPattern, idPattern } from "../src/docs/brands.ts"
import { loadCorpus } from "../src/docs/corpus.ts"
import {
  fmtJson,
  recordsSchemaDefs,
  recordsSchemaFile,
  resolverFixture,
  schemaFile,
} from "../src/docs/json-artifacts.ts"
import {
  type DocCategory,
  docCategories,
  subKindEnums,
} from "../src/docs/taxonomy.ts"
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

function eachObj(node: unknown, f: (o: Obj) => void): void {
  if (Array.isArray(node)) {
    for (const v of node) eachObj(v, f)
  } else if (isObj(node)) {
    f(node)
    for (const v of Object.values(node)) eachObj(v, f)
  }
}

function mapRefs(node: unknown, f: (ref: string) => string): void {
  eachObj(node, o => {
    if (typeof o.$ref === "string") o.$ref = f(o.$ref)
  })
}

// The generator percent-encodes def names in `$ref`s.
const refTo = (name: string) => `#/$defs/${encodeURIComponent(name)}`

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
  mapRefs(out, ref => ref.replace(/^#\/definitions\//, "#/$defs/"))
  return out
}

/** Record definition a `#/$defs/<name>` reference points at. */
function defOf(defs: Defs, ref: string): { name: string; def: Obj } {
  const name = decodeURIComponent(ref.replace(/^#\/\$defs\//, ""))
  const def = defs[name]
  if (!def) throw new Error(`unresolved $ref ${ref}`)
  return { name, def }
}

function addDef(defs: Defs, name: string, def: Obj): void {
  if (name in defs) throw new Error(`$defs already has a "${name}" entry`)
  defs[name] = def
}

/** Drop `name`; what referenced it references `to`. */
function redirectDef(defs: Defs, name: string, to: string): void {
  delete defs[name]
  mapRefs(defs, ref => (ref === refTo(name) ? refTo(to) : ref))
}

function renameDef(defs: Defs, from: string, to: string): void {
  addDef(defs, to, defOf(defs, refTo(from)).def)
  redirectDef(defs, from, to)
}

/** A record definition's object schemas: one, or per `anyOf` branch. */
const branches = (record: Obj): Obj[] =>
  Array.isArray(record.anyOf) ? (record.anyOf as Obj[]) : [record]

function propsOf(branch: Obj, key: string): Obj {
  const props = branch.properties as Obj | undefined
  if (!props || !(key in props)) {
    throw new Error(`record definition without a ${key} property`)
  }
  return props
}

/**
 * Per-category `_subKind`: required with the corpus enum where the category
 * has sub-kinds, absent (so `additionalProperties: false` rejects it) where
 * it has none. The type declares an optional string; the corpus invariant
 * ("always-or-never per category") is what makes this precise.
 */
function pinSubKind(record: Obj, values: readonly string[] | undefined): void {
  for (const branch of branches(record)) {
    const props = propsOf(branch, "_subKind")
    if (values === undefined) {
      delete props._subKind
    } else {
      props._subKind = { type: "string", enum: [...values] }
      branch.required = [...(branch.required as string[]), "_subKind"]
    }
  }
}

/**
 * One identity definition per category: `id` and every cross-reference (a
 * `Documented<cat>` field such as `aliasOf`) point at it, so the schema says
 * they hold the same kind of value — the shell-safe slug pattern. `display`
 * gets its pattern pinned in place.
 */
function hoistId(defs: Defs, cat: DocCategory, record: Obj): void {
  const idName = recordsSchemaDefs.id(cat)
  let identity: Obj | undefined
  for (const branch of branches(record)) {
    const props = propsOf(branch, "id")
    identity ??= props.id as Obj
    props.id = { $ref: refTo(idName) }
    const display = propsOf(branch, "display").display as Obj
    display.pattern = displayPattern.source
  }
  if (!identity) throw new Error(`${cat}: record has no branch`)
  // The generator names the `Documented<cat>` instantiation (a def that would
  // leak); it becomes this def. The brand's own description is `Documented`'s,
  // not the field's.
  addDef(defs, idName, {
    type: "string",
    pattern: idPattern.source,
    description: `\`${cat}\` record identity — the record's \`id\`, and what a field referring to one holds. ${String(identity.description)}`,
  })
  redirectDef(defs, `Documented<"${cat}">`, idName)
}

// Every `$ref` resolves, and no TS generic leaked as a def name — a new brand
// or record wrapper would surface here, not in a consumer's type generator.
function assertClean(bundle: Obj): void {
  const defs = bundle.$defs as Defs
  eachObj(bundle, o => {
    if (typeof o.$ref === "string") defOf(defs, o.$ref)
  })
  const leaked = Object.keys(defs).filter(name => name.includes("<"))
  if (leaked.length > 0) {
    throw new Error(`TS generics in $defs: ${leaked.join(", ")}`)
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
  const recordDefs = new Set(docCategories.map(recordsSchemaDefs.record))

  for (const cat of docCategories) {
    const items = rootProps[cat]?.items as Obj | undefined
    if (typeof items?.$ref !== "string") {
      throw new Error(`${cat}: root property is not an array of $ref items`)
    }
    const { name, def } = defOf(defs, items.$ref)
    // Renamed already: two categories share one record type.
    if (recordDefs.has(name)) {
      throw new Error(`${name} is also the record type of ${cat}`)
    }
    pinSubKind(def, enums[cat])

    // Consumers key on category-named defs, not on TS type names.
    renameDef(defs, name, recordsSchemaDefs.record(cat))
    hoistId(defs, cat, def)
    addDef(defs, recordsSchemaDefs.file(cat), rootProps[cat] as Obj)
    rootProps[cat] = { $ref: refTo(recordsSchemaDefs.file(cat)) }
  }
  assertClean(bundle)
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
