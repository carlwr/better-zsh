// The Node twin of `src/lib/search.ts` — the search pipeline (embed → rank →
// lookup-map promote) over the Node embedder, for the evals; the two share
// the ranker and the result shape.

import { type DocCategory, docCategories } from '@carlwr/zsh-core/taxonomy';

import { type LookupIndex, promoteToTop } from '../src/lib/ranker/lookup-map';
import { rank } from '../src/lib/ranker/rank';
import type { Rules } from '../src/lib/ranker/rules';
import type { VectorIndex } from '../src/lib/ranker/types';
import type { SearchResult } from '../src/lib/search';
import { type Embedder, embedQuery } from './embedder-node';

export interface SearchInput {
  query: string;
  /** Default `DEFAULT_LIMIT`. */
  limit?: number;
  category?: string;
}

export interface SearchDeps {
  index: VectorIndex;
  rules: Rules;
  lookup: LookupIndex;
  embedder: Embedder;
}

const DEFAULT_LIMIT = 10;

function isDocCategory(s: string): s is DocCategory {
  return (docCategories as readonly string[]).includes(s);
}

/** Narrow a request's `category`; an unknown one is a caller error, not an empty result. */
export function docCategory(s: string): DocCategory {
  if (!isDocCategory(s)) throw new Error(`unknown category ${JSON.stringify(s)}`);
  return s;
}

export async function searchNode(input: SearchInput, deps: SearchDeps): Promise<SearchResult> {
  const query = input.query.trim();
  if (query === '') return { matches: [], total: 0 };
  const category = input.category === undefined ? undefined : docCategory(input.category);
  // Expansion is embedding-only: the raw query drives the lexical boosts.
  const queryVec = await embedQuery(deps.embedder, query, deps.rules);
  const mapHit0 = deps.lookup.lookup(query);
  const mapHit = mapHit0 && (category === undefined || mapHit0.category === category) ? mapHit0 : null;
  const ranked = rank(query, queryVec, category ?? null, deps.index, deps.rules);
  promoteToTop(ranked, mapHit);
  return { matches: ranked.slice(0, input.limit ?? DEFAULT_LIMIT), total: ranked.length };
}
