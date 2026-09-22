// Artifact gating, on-disk loaders and the compare-or-rewrite helper shared
// by the tests.

import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { type DocCorpus, docCategories } from "@carlwr/zsh-core"
import { expect } from "vitest"
import type { Rules } from "../nlp/core/rules"
import {
  type SearchIndexText,
  SearchIndexTextSchema,
} from "../nlp/core/search-index"
import type { RecordId, VectorIndex } from "../nlp/core/types"
import type { RankAssets } from "../nlp/node/eval/sentence"
import { buildParityIndex } from "../nlp/node/fixtures"
import { readIndex } from "../nlp/node/index-build"
import { prettyJson, readJson, readYaml } from "../nlp/node/io"
import { PATHS } from "../nlp/node/paths"
import { emptyLookup } from "./_fixtures"

export { loadParityFixture, loadSanityFixture } from "../nlp/node/fixtures"
export { PATHS, STAGED } from "../nlp/node/paths"

/** Ranking assets over the parity fixture's miniature index (no model); the lookup hits nothing unless given. */
export const parityRankAssets = (
  corpus: DocCorpus,
  rules: Rules,
  lookup = emptyLookup(),
): RankAssets => ({
  index: buildParityIndex(corpus, rules.synonyms.index_groups),
  rules,
  lookup,
})

/** Whether `corpus` holds a record of that identity; an unknown category is a miss. The cast peels the key brand. */
export const inCorpus = (corpus: DocCorpus, r: RecordId): boolean =>
  docCategories.some(
    cat =>
      cat === r.category &&
      (corpus[cat] as ReadonlyMap<string, unknown>).has(r.id),
  )

/**
 * Reason for `ctx.skip(reason)`; null when everything in `needs` is staged.
 * A verbose reporter prints a ctx.skip note, whereas `it.skipIf` coerces its
 * argument to a boolean and drops the text. Throws when CI requires
 * artifacts. `needs` is per-test on purpose: gating a test on the 127M model
 * it never loads makes deleting the model silently skip it.
 */
export function artifactGate(
  label: string,
  needs: readonly string[],
): string | null {
  const missing = needs.filter(p => !existsSync(p))
  if (missing.length === 0) return null
  const msg = `${label}: not staged locally — ${missing.join(", ")}`
  if (process.env.BZ_REQUIRE_WEB_ARTIFACTS === "1") {
    throw new Error(`${msg} (BZ_REQUIRE_WEB_ARTIFACTS=1)`)
  }
  return msg
}

/**
 * Compare-or-rewrite for a committed, generated JSON file: with `envVar` set
 * the file is (re)written from `generated`; otherwise it must exist and equal
 * `generated` as parsed JSON (formatting is free to differ). `render` is the
 * writer, so a fixture with its own number printing round-trips through it
 * before the comparison; `expected` maps the generated value to what the
 * committed one must equal — the identity unless a golden admits a
 * tolerance (`withinDecimals`).
 */
export async function assertCommittedJson(
  path: string,
  generated: unknown,
  envVar: string,
  {
    render = prettyJson,
    expected = v => v,
  }: {
    render?: (value: unknown) => string
    expected?: (generated: unknown) => unknown
  } = {},
): Promise<void> {
  const text = render(generated)
  if (process.env[envVar] === "1") {
    await writeFile(path, text)
    return
  }
  if (!existsSync(path)) {
    throw new Error(`${path} is missing — generate it with ${envVar}=1`)
  }
  expect(await readJson(path)).toEqual(expected(JSON.parse(text)))
}

/**
 * `value` with every number an `expect.closeTo(number, digits)` matcher:
 * `toEqual` then admits float noise below half a unit in the `digits`-th
 * decimal and nothing else — structure and strings stay exact.
 */
export function withinDecimals(value: unknown, digits: number): unknown {
  if (typeof value === "number") return expect.closeTo(value, digits)
  if (Array.isArray(value)) return value.map(x => withinDecimals(x, digits))
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, x]) => [k, withinDecimals(x, digits)]),
    )
  }
  return value
}

export const readData = (path: string): Promise<unknown> =>
  path.endsWith(".yaml") ? readYaml(path) : readJson(path)

/** The staged index, schema-validated (not corpus-validated: that is `validateIndex`'s test). */
export const loadIndexFromDisk = (): Promise<VectorIndex> =>
  readIndex(PATHS.searchIndex)

/** Its text half alone — no blob read, no finiteness scan, and it gates on
 * `STAGED.indexText`. What a test reading only record text wants. */
export const loadIndexTextFromDisk = async (): Promise<SearchIndexText> =>
  SearchIndexTextSchema.parse(await readJson(PATHS.searchIndex.json))
