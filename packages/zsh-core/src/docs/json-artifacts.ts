import { createHash } from "node:crypto"
import type { DocCorpus } from "./corpus.ts"
import { assertAsciiIdentity, augmentWithMarkdown } from "./json-projection.ts"
import { type DocCategory, docCategories } from "./taxonomy.ts"

// Per-category file and count key derive from one `base`.
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
}

const camelize = (s: string): string =>
  s.replace(/-(.)/g, (_, c: string) => c.toUpperCase())

function baseFor<K extends DocCategory>(cat: K): Base<K> {
  return ((baseOverrides as Partial<Record<DocCategory, string>>)[cat] ??
    `${cat.replace(/_/g, "-")}s`) as Base<K>
}

function artifactFor<K extends DocCategory>(cat: K): Artifact<K> {
  const b = baseFor(cat)
  return { file: `${b}.json`, count: camelize(b) } as Artifact<K>
}

export const jsonArtifact: { [K in DocCategory]: Artifact<K> } =
  Object.fromEntries(docCategories.map(cat => [cat, artifactFor(cat)])) as {
    [K in DocCategory]: Artifact<K>
  }

type JsonArtifact = (typeof jsonArtifact)[DocCategory]

export type JsonDataFile = JsonArtifact["file"]
export type JsonCountKey = JsonArtifact["count"]

export const jsonDataFiles = [...docCategories]
  .map(cat => jsonArtifact[cat].file)
  .sort() as readonly JsonDataFile[]

export const jsonFiles = ["index.json", ...jsonDataFiles] as const

/**
 * One schema bundle for every record file: `#/$defs/<DocCategory>` describes
 * that category's file (an array of its records).
 */
export const recordsSchemaFile = "records.schema.json"

/** Schema file beside a non-record JSON file (`index.json`, the fixture). */
export function schemaFile(file: string): string {
  return file.replace(/\.json$/, ".schema.json")
}

// The resolver conformance fixture is a release asset of its own.
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

/**
 * Machine artifacts stay deterministic and human-readable without a second
 * formatting pass; these files are generated, not edited.
 */
export function fmtJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

/**
 * The record files of `corpus`' JSON build, text by data file — what the
 * build writes and `dataHash` covers. Refuses a corpus whose projected
 * identity fields are not ASCII (`assertAsciiIdentity`).
 */
export function jsonRecordTexts(
  corpus: DocCorpus,
): ReadonlyMap<JsonDataFile, string> {
  return new Map<JsonDataFile, string>(
    docCategories.map(cat => {
      const augmented = augmentWithMarkdown(corpus, cat)
      assertAsciiIdentity(cat, augmented)
      return [jsonArtifact[cat].file, fmtJson(augmented)] as const
    }),
  )
}

/**
 * Content identity of `corpus`: equals `JsonIndex.dataHash` of its JSON
 * build. Hashes the record file names plus their formatted record texts —
 * renders every record (tens of milliseconds).
 */
export function corpusDataHash(corpus: DocCorpus): string {
  return hashRecordFiles(jsonRecordTexts(corpus))
}
