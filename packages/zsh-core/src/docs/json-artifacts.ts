import { createHash } from "node:crypto"
import { type DocCategory, docCategories } from "./taxonomy.ts"

// Each category contributes a JSON data file, a camelCase count key, and a
// PascalCase schema root name. All three derive from one `base` string:
//   file   = `${base}.json`
//   count  = camelCase(base)
//   schema = `${PascalCase(base)}Json`
// Default base is the category name with `_` → `-` and a trailing `s`. Two
// categories deviate from the simple plural-s rule and need explicit overrides.
const baseOverrides = {
  glob_op: "glob-operators",
  comp_utility: "comp-utils",
} as const satisfies Partial<Record<DocCategory, string>>

type BaseOverrides = typeof baseOverrides

type SnakeToKebab<S extends string> = S extends `${infer A}_${infer B}`
  ? `${A}-${SnakeToKebab<B>}`
  : S

type Camelize<S extends string> = S extends `${infer A}-${infer B}`
  ? `${A}${Capitalize<Camelize<B>>}`
  : S

type Base<K extends DocCategory> = K extends keyof BaseOverrides
  ? BaseOverrides[K]
  : `${SnakeToKebab<K>}s`

type Artifact<K extends DocCategory> = {
  readonly file: `${Base<K>}.json`
  readonly count: Camelize<Base<K>>
  readonly schema: `${Capitalize<Camelize<Base<K>>>}Json`
}

const camelize = (s: string): string =>
  s.replace(/-(.)/g, (_, c: string) => c.toUpperCase())

function baseFor<K extends DocCategory>(cat: K): Base<K> {
  return ((baseOverrides as Partial<Record<DocCategory, string>>)[cat] ??
    `${cat.replace(/_/g, "-")}s`) as Base<K>
}

function artifactFor<K extends DocCategory>(cat: K): Artifact<K> {
  const b = baseFor(cat)
  const c = camelize(b)
  return {
    file: `${b}.json`,
    count: c,
    schema: `${c.charAt(0).toUpperCase()}${c.slice(1)}Json`,
  } as Artifact<K>
}

export const jsonArtifact: { [K in DocCategory]: Artifact<K> } =
  Object.fromEntries(docCategories.map(cat => [cat, artifactFor(cat)])) as {
    [K in DocCategory]: Artifact<K>
  }

type JsonArtifact = (typeof jsonArtifact)[DocCategory]

export type JsonDataFile = JsonArtifact["file"]
export type JsonCountKey = JsonArtifact["count"]
export type JsonSchemaRoot = JsonArtifact["schema"]

export const jsonDataFiles = [...docCategories]
  .map(cat => jsonArtifact[cat].file)
  .sort() as readonly JsonDataFile[]

export const jsonFiles = ["index.json", ...jsonDataFiles] as const

export function schemaFile(file: string): string {
  return file.replace(/\.json$/, ".schema.json")
}

// The resolver conformance fixture is a release asset of its own; its
// `artifacts/` subdir, file and schema root derive from one base.
const fixtureBase = "resolver-fixture"
export const resolverFixture = {
  dir: fixtureBase,
  file: `${fixtureBase}.json`,
  schema: "ResolverFixtureJson",
} as const

/**
 * Lets a consumer ask "same bytes as the release I already have?" without a
 * version line someone has to author and keep honest.
 */
export function hashRecordFiles(texts: ReadonlyMap<string, string>): string {
  const h = createHash("sha256")
  for (const file of [...texts.keys()].sort()) {
    h.update(`${file}\0${texts.get(file)}\0`)
  }
  return h.digest("hex")
}
