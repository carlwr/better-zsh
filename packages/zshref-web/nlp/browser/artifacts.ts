// Centralised loader for the static JSON artifacts under `/artifacts/`
// (SvelteKit static folder), written by `pnpm build:index`. Loads are
// zod-validated.

import { memoizedRetry } from "@carlwr/typescript-extra"
import { loadVectorIndex } from "../core/index-loader"
import { LookupIndex, LookupMapSchema } from "../core/lookup-map"
import type { Rules } from "../core/rules"
import { loadRules } from "../core/rules"
import type { Category, VectorIndex } from "../core/types"
import { CategoriesSchema } from "../core/types"

const BASE = "/artifacts"

export interface Artifacts {
  index: VectorIndex
  rules: Rules
  categories: Category[]
  lookup: LookupIndex
}

export async function loadArtifacts(
  fetcher: typeof fetch = fetch,
): Promise<Artifacts> {
  const [
    indexJson,
    tuningJson,
    stopwordsJson,
    synonymsJson,
    categoriesJson,
    lookupMapJson,
  ] = await Promise.all([
    getJson(fetcher, `${BASE}/index.json`),
    getJson(fetcher, `${BASE}/rules/tuning.json`),
    getJson(fetcher, `${BASE}/rules/stopwords.json`),
    getJson(fetcher, `${BASE}/rules/synonyms.json`),
    getJson(fetcher, `${BASE}/categories.json`),
    getJson(fetcher, `${BASE}/lookup-map.json`),
  ])
  const index = loadVectorIndex(indexJson)
  const rules = loadRules({
    tuning: tuningJson,
    stopwords: stopwordsJson,
    synonyms: synonymsJson,
  })
  const categories = CategoriesSchema.parse(categoriesJson).categories
  const lookup = new LookupIndex(LookupMapSchema.parse(lookupMapJson))
  return { index, rules, categories, lookup }
}

// Cached production load: the index (~20 MB) is parsed and validated once and
// shared across route navigations / deep-links; a transient fetch failure is
// not cached, so the next call re-attempts. Tests call `loadArtifacts(fetcher)`
// directly to stay network-free.
export const getArtifacts = memoizedRetry(loadArtifacts)

async function getJson(fetcher: typeof fetch, url: string): Promise<unknown> {
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`)
  return res.json()
}
