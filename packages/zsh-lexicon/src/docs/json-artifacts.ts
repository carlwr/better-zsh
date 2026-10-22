import { createHash } from "node:crypto"
import { assertShellSafeIdentity, projectRecords } from "./json-projection.ts"
import type { JsonDocArrayMap } from "./json-types.ts"
import type { Lexicon } from "./lexicon.ts"
import { type DocCategory, docCategories } from "./taxonomy.ts"

/** The record file: every category's record array under its category (`JsonDocArrayMap`). */
export const recordsFile = "records.json"

/** Schema file beside a JSON file (`index.json`, the record file, the fixture). */
export function schemaFile(file: string): string {
  return file.replace(/\.json$/, ".schema.json")
}

/** The record file's schema bundle. */
export const recordsSchemaFile: string = schemaFile(recordsFile)

/**
 * The records bundle's per-category `$defs` entries: `records` describes the
 * category's record array, `record` one record, `id` a record's identity —
 * what its `id` holds, and what a field referring to a record of that
 * category holds.
 */
export const recordsSchemaDefs = {
  records: (cat: DocCategory): DocCategory => cat,
  record: (cat: DocCategory): string => `${cat}.record`,
  id: (cat: DocCategory): string => `${cat}.id`,
} as const

// The resolver conformance fixture is a release asset of its own.
export const resolverFixture = {
  dir: "resolver-fixture",
  file: "resolver-fixture.json",
  schema: "ResolverFixtureJson",
} as const

/**
 * `dataHash`: SHA-256 of the record file's bytes (`shasum -a 256
 * records.json`). Lets a consumer ask "same bytes as the release I already
 * have?" without a version line someone has to author and keep honest.
 */
export function hashRecords(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

/**
 * Machine artifacts stay deterministic and human-readable without a second
 * formatting pass; these files are generated, not edited.
 */
export function fmtJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

/**
 * The record file of `lexicon`'s JSON build: the record arrays keyed by
 * category, in primary category order. Refuses a lexicon whose identity
 * fields are not shell-safe ASCII (`assertShellSafeIdentity`).
 */
export function jsonRecords(lexicon: Lexicon): JsonDocArrayMap {
  const entries = docCategories.map(cat => {
    const projected = projectRecords(lexicon, cat)
    assertShellSafeIdentity(projected)
    return [cat, projected] as const
  })
  // TS cannot carry the key/value correlation through `fromEntries`.
  return Object.fromEntries(entries) as JsonDocArrayMap
}

/** `jsonRecords` as the text the build writes — what `dataHash` covers. */
export function jsonRecordsText(lexicon: Lexicon): string {
  return fmtJson(jsonRecords(lexicon))
}
