import { createHash } from "node:crypto"
import type { DocCorpus } from "./corpus.ts"
import { assertAsciiIdentity, projectRecords } from "./json-projection.ts"
import { type DocCategory, docCategories } from "./taxonomy.ts"

/** A category's record file — named after the category, one spelling for id, file and schema entry. */
export type JsonDataFile = `${DocCategory}.json`

export function jsonDataFile<K extends DocCategory>(cat: K): `${K}.json` {
  return `${cat}.json`
}

export const jsonDataFiles: readonly JsonDataFile[] = docCategories
  .map(cat => jsonDataFile(cat))
  .sort()

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
      const projected = projectRecords(corpus, cat)
      assertAsciiIdentity(cat, projected)
      return [jsonDataFile(cat), fmtJson(projected)] as const
    }),
  )
}

/**
 * Content identity of `corpus`: equals `JsonIndex.dataHash` of its JSON
 * build. Hashes the record file names plus their formatted record texts —
 * renders every record (cheap, not free).
 */
export function corpusDataHash(corpus: DocCorpus): string {
  return hashRecordFiles(jsonRecordTexts(corpus))
}
