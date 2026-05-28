// Centralised loader for the static JSON artifacts under `/artifacts/`
// (SvelteKit static folder), staged by `scripts/fetch-artifacts`
// pre-extraction or fetched from a zshref release after. Loads are
// zod-validated.

import { z } from 'zod';
import { memoizedRetry } from './memoizedRetry';
import { loadVectorIndex } from './ranker/index-loader';
import { LookupIndex, LookupMapSchema } from './ranker/lookup-map';
import { loadRules } from './ranker/rules';
import type { VectorIndex } from './ranker/types';
import type { Rules } from './ranker/rules';

const BASE = '/artifacts';

const CategoryEntry = z.object({ id: z.string(), label: z.string() });
const CategoriesSchema = z.object({
  version: z.literal(1),
  categories: z.array(CategoryEntry)
});
export type Category = z.infer<typeof CategoryEntry>;

export interface Artifacts {
  index: VectorIndex;
  rules: Rules;
  categories: Category[];
  lookup: LookupIndex;
}

/** Display label for a category id; falls back to the raw id when
 * categories.json has no entry. */
export function categoryLabel(categories: Category[], id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id;
}

export async function loadArtifacts(fetcher: typeof fetch = fetch): Promise<Artifacts> {
  const [indexJson, tuningJson, stopwordsJson, synonymsJson, categoriesJson, lookupMapJson] =
    await Promise.all([
      getJson(fetcher, `${BASE}/index.json`),
      getJson(fetcher, `${BASE}/rules/tuning.json`),
      getJson(fetcher, `${BASE}/rules/stopwords.json`),
      getJson(fetcher, `${BASE}/rules/synonyms.json`),
      getJson(fetcher, `${BASE}/categories.json`),
      getJson(fetcher, `${BASE}/lookup-map.json`)
    ]);
  const index = loadVectorIndex(indexJson);
  const rules = loadRules({
    tuning: tuningJson,
    stopwords: stopwordsJson,
    synonyms: synonymsJson
  });
  const categories = CategoriesSchema.parse(categoriesJson).categories;
  const lookup = new LookupIndex(LookupMapSchema.parse(lookupMapJson));
  return { index, rules, categories, lookup };
}

// Cached production load: the index (~20 MB) is parsed and validated once and
// shared across route navigations / deep-links. Tests call
// `loadArtifacts(fetcher)` directly to stay network-free.
export const getArtifacts = memoizedRetry(loadArtifacts);

async function getJson(fetcher: typeof fetch, url: string): Promise<unknown> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}
