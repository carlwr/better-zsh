// The Node-side search runner the evals share: embed → resolver hit → rank
// → lookup-map promote. It keeps the `batch --debug` response shape of the
// retired Rust CLI, 6-decimal rounding included, so the recorded oracle
// captures stay comparable. The resolver hit is a parameter — oracle mode
// computes it from the corpus (`corpusResolverHit`, as the captures had
// it), product mode passes none (`noResolverHit`, what the SPA does). The
// product path itself is src/lib/search.ts, untouched.

import type { DocCorpus } from '@carlwr/zsh-core';
import { type DocCategory, docCategories } from '@carlwr/zsh-core/taxonomy';

import { type LookupIndex, promoteToTop } from '../src/lib/ranker/lookup-map';
import { rank } from '../src/lib/ranker/rank';
import type { Rules } from '../src/lib/ranker/rules';
import type { RankedMatch, ResolverHit, VectorIndex } from '../src/lib/ranker/types';
import { type Embedder, embedQuery } from './embedder-node';
import { resolverKey } from './resolver-key';

/** The ranker's resolver-hit input for a (trimmed) query. */
export type ResolverHitSource = (query: string, category?: DocCategory) => ResolverHit | null;

/** Product mode: no resolver. */
export const noResolverHit: ResolverHitSource = () => null;

/** Oracle mode: the corpus resolver's verdict on the query. */
export const corpusResolverHit =
  (corpus: DocCorpus): ResolverHitSource =>
  (query, category) =>
    resolverKey(corpus, query, category);

export interface OracleInput {
  query: string;
  /** Default `DEFAULT_LIMIT`. */
  limit?: number;
  category?: string;
  debug?: boolean;
}

export interface OracleDeps {
  index: VectorIndex;
  rules: Rules;
  lookup: LookupIndex;
  embedder: Embedder;
  resolverHit: ResolverHitSource;
}

// Field order = the emitted key order (what the captures were compared on).
export interface OracleMatch {
  title: string;
  category: { id: string; label: string };
  id: string;
  display: string;
  subKind?: string;
  score: number;
  mdBody: string;
  debug?: {
    semantic: { structured: number; body: number; expanded: number };
    boosts: { category: number; resolver: number; lexical: number };
    retrievalText: { structured: string; body: string; expanded: string };
  };
}

export interface OracleResponse {
  /** As given, untrimmed. */
  query: string;
  matches: OracleMatch[];
  matchesReturned: number;
  matchesTotal: number;
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

/**
 * 6 decimals of the f64 widening, half away from zero (the captures'
 * rounding). `Math.round` alone rounds a negative half toward +∞.
 */
export function rounded(v: number): number {
  const x = v * 1e6;
  return (Math.sign(x) * Math.round(Math.abs(x))) / 1e6;
}

function matchJson(m: RankedMatch, debug: boolean): OracleMatch {
  const r = m.rec;
  return {
    title: `${r.category_label}: ${r.display}`,
    category: { id: r.category, label: r.category_label },
    id: r.id,
    display: r.display,
    ...(r.sub_kind !== undefined ? { subKind: r.sub_kind } : {}),
    score: rounded(m.score),
    mdBody: r.md_body,
    ...(debug
      ? {
          debug: {
            semantic: {
              structured: rounded(m.debug.semantic.structured),
              body: rounded(m.debug.semantic.body),
              expanded: rounded(m.debug.semantic.expanded)
            },
            boosts: {
              category: rounded(m.debug.boosts.category),
              resolver: rounded(m.debug.boosts.resolver),
              lexical: rounded(m.debug.boosts.lexical)
            },
            retrievalText: { structured: r.structured, body: r.body, expanded: r.expanded }
          }
        }
      : {})
  };
}

export async function oracleSearch(input: OracleInput, deps: OracleDeps): Promise<OracleResponse> {
  const query = input.query.trim();
  if (query === '') {
    return { query: input.query, matches: [], matchesReturned: 0, matchesTotal: 0 };
  }
  const category = input.category === undefined ? undefined : docCategory(input.category);
  // Expansion is embedding-only: the raw query drives the lexical boosts.
  const queryVec = await embedQuery(deps.embedder, query, deps.rules);
  const resolverHit = deps.resolverHit(query, category);
  const mapHit0 = deps.lookup.lookup(query);
  const mapHit = mapHit0 && (category === undefined || mapHit0.category === category) ? mapHit0 : null;
  const ranked = rank(query, queryVec, resolverHit, category ?? null, deps.index, deps.rules);
  promoteToTop(ranked, mapHit);
  const matches = ranked.slice(0, input.limit ?? DEFAULT_LIMIT).map((m) => matchJson(m, input.debug ?? false));
  return { query: input.query, matches, matchesReturned: matches.length, matchesTotal: ranked.length };
}
