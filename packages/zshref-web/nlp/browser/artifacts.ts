// Centralised loader for the static JSON artifacts under `/artifacts/`
// (SvelteKit static folder), written by `pnpm build:index`. Loads are
// zod-validated.

import { memoizedRetry } from "@carlwr/typescript-extra"
import { ARTIFACT, ARTIFACTS_DIR, ruleArtifact } from "../core/artifact-files"
import {
  type LookupIndex,
  LookupMapSchema,
  lookupIndex,
} from "../core/lookup-map"
import { byRuleFile, loadRules, RULE_FILES, type Rules } from "../core/rules"
import {
  CategoriesSchema,
  type Category,
  loadVectorIndex,
  type VectorIndex,
} from "../core/types"

const BASE = `/${ARTIFACTS_DIR}`

export interface Artifacts {
  index: VectorIndex
  rules: Rules
  categories: Category[]
  lookup: LookupIndex
}

export async function loadArtifacts(
  fetcher: typeof fetch = fetch,
): Promise<Artifacts> {
  const [indexJson, categoriesJson, lookupMapJson, ...ruleJsons] =
    await Promise.all([
      getJson(fetcher, `${BASE}/${ARTIFACT.index}`),
      getJson(fetcher, `${BASE}/${ARTIFACT.categories}`),
      getJson(fetcher, `${BASE}/${ARTIFACT.lookupMap}`),
      ...RULE_FILES.map(f => getJson(fetcher, `${BASE}/${ruleArtifact(f)}`)),
    ])
  const index = loadVectorIndex(indexJson)
  const rules = loadRules(byRuleFile((_, at) => ruleJsons[at]))
  const categories = CategoriesSchema.parse(categoriesJson).categories
  const lookup = lookupIndex(LookupMapSchema.parse(lookupMapJson))
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
