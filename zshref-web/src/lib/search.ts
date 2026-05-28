// Full search pipeline: embed query → rank against index. A pre-ranker
// lookup-map check hard-promotes canonical-identifier queries (e.g.
// `AUTO_CD`, `_arguments`) to slot 0 — the resolver's claim is categorical,
// not probabilistic, so it bypasses ranker math for the top slot. Slots
// 2..N still come from the ranker.
//
// No TS-side resolver (zshref-web doesn't depend on @carlwr/zsh-core) — the
// resolver-hit boost path is therefore always null here. The pre-computed
// lookup-map subsumes canonical-form resolution.

import { embedQuery } from './embedder';
import { expandQueryForEmbedding } from './ranker/query-expand';
import { rank } from './ranker/rank';
import type { LookupIndex } from './ranker/lookup-map';
import type { Rules } from './ranker/rules';
import type { RankedMatch, VectorIndex } from './ranker/types';

export async function search(args: {
  query: string;
  index: VectorIndex;
  rules: Rules;
  lookup: LookupIndex;
  limit?: number;
  categories?: string[] | null;
}): Promise<{ matches: RankedMatch[]; total: number }> {
  const q = args.query.trim();
  if (q === '') return { matches: [], total: 0 };
  // Expansion is embedding-only: raw `q` drives lexical boosts in `rank`.
  const queryVec = await embedQuery(
    expandQueryForEmbedding(q, args.rules.synonyms.query_expansions)
  );
  // Multi-category filter is applied here, post-rank, not pushed into `rank`:
  // category penalties derive from full-corpus counts, so filtering the ranked
  // output is score-identical to filtering inside `rank`, and keeps the
  // rank.rs-mirrored `rank()` on its single-category Rust signature.
  //
  // `categories` semantics: null = no filter (all); a list = keep exactly those
  // (so [] keeps nothing). The caller passes null when every category is ticked,
  // which is both the unfiltered fast path and robust to a record whose category
  // is absent from the checkbox list.
  const cats = args.categories == null ? null : new Set(args.categories);
  const ranked0 = rank(q, queryVec, null, null, args.index, args.rules);
  const ranked = cats ? ranked0.filter((m) => cats.has(m.rec.category)) : ranked0;
  const mapHit = args.lookup.lookup(q);
  if (mapHit && (cats === null || cats.has(mapHit.category))) {
    const pos = ranked.findIndex(
      (m) => m.rec.category === mapHit.category && m.rec.id === mapHit.id
    );
    if (pos > 0) {
      const [hit] = ranked.splice(pos, 1);
      if (hit) ranked.unshift(hit);
    }
  }
  const total = ranked.length;
  const matches = ranked.slice(0, args.limit ?? 20);
  return { matches, total };
}
