// Centralised loader for the static artifacts under `/artifacts/`, written
// by `pnpm build:index`. The JSON is zod-validated; the vector blob is
// header- and length-checked instead (`nlp/core/vector-blob.ts`).

import { memoizedRetry } from "@carlwr/typescript-extra"
import { ARTIFACT, ARTIFACTS_DIR, ruleArtifact } from "../core/artifact-files"
import {
  type LookupIndex,
  LookupMapSchema,
  lookupIndex,
} from "../core/lookup-map"
import { byRuleFile, loadRules, RULE_FILES, type Rules } from "../core/rules"
import {
  joinSearchIndex,
  type SearchIndexText,
  SearchIndexTextSchema,
} from "../core/search-index"
import {
  CategoriesSchema,
  type Category,
  modelMismatch,
  type VectorIndex,
} from "../core/types"

const BASE = `/${ARTIFACTS_DIR}`

export interface ArtifactSource {
  /** The test seam; the platform `fetch` otherwise. */
  fetch?: typeof fetch
  /** The artifacts root; a subpath deploy (`kit.paths.base`) moves it. */
  base?: string
}

/** Everything but the vectors: enough to show a record, not to search. */
export interface TextArtifacts {
  index: SearchIndexText
  rules: Rules
  categories: Category[]
  lookup: LookupIndex
}

/** `TextArtifacts` with the vectors joined in: what search needs. */
export interface Artifacts extends Omit<TextArtifacts, "index"> {
  index: VectorIndex
}

export async function loadTextArtifacts(
  src: ArtifactSource = {},
): Promise<TextArtifacts> {
  const [indexJson, categoriesJson, lookupMapJson, ...ruleJsons] =
    await Promise.all([
      getJson(src, ARTIFACT.searchIndex),
      getJson(src, ARTIFACT.categories),
      getJson(src, ARTIFACT.lookupMap),
      ...RULE_FILES.map(f => getJson(src, ruleArtifact(f))),
    ])
  return {
    index: SearchIndexTextSchema.parse(indexJson),
    rules: loadRules(byRuleFile((_, at) => ruleJsons[at])),
    categories: CategoriesSchema.parse(categoriesJson).categories,
    lookup: lookupIndex(LookupMapSchema.parse(lookupMapJson)),
  }
}

/** `text` is a seam: passing an in-flight text load shares it instead of
 * fetching the JSON half twice. A partial failure rejects the whole load, as
 * does an index of another model than the queries': its scores would be noise.
 * The text alone stays loadable — a record page needs no vectors. */
export async function loadArtifacts(
  src: ArtifactSource = {},
  text: Promise<TextArtifacts> = loadTextArtifacts(src),
): Promise<Artifacts> {
  const [loaded, vectors] = await Promise.all([
    text,
    getBytes(src, ARTIFACT.searchVectors),
  ])
  const mismatch = modelMismatch(loaded.index)
  if (mismatch) throw new Error(mismatch)
  return { ...loaded, index: joinSearchIndex(loaded.index, vectors) }
}

// Cached production loads, shared across route navigations and deep links;
// a transient fetch failure is not cached, so the next call re-attempts.
// The record page takes the text alone — a deep link never downloads the
// vectors, which are most of the payload — and a search afterwards reuses
// its text load. Tests call `loadTextArtifacts`/`loadArtifacts` directly to
// stay network-free.
export const getTextArtifacts = memoizedRetry(() => loadTextArtifacts())
export const getArtifacts = memoizedRetry(() =>
  loadArtifacts({}, getTextArtifacts()),
)

const at = (src: ArtifactSource, file: string): string =>
  `${src.base ?? BASE}/${file}`

async function get(src: ArtifactSource, file: string): Promise<Response> {
  const url = at(src, file)
  const res = await (src.fetch ?? fetch)(url)
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`)
  return res
}

const getJson = async (src: ArtifactSource, file: string): Promise<unknown> =>
  (await get(src, file)).json()

const getBytes = async (
  src: ArtifactSource,
  file: string,
): Promise<ArrayBuffer> => (await get(src, file)).arrayBuffer()
