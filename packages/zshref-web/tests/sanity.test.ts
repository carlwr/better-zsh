// Product-mode sanity smoke: the SPA's own pipeline — the production
// `embedQuery` (src/lib/embedder.ts, over the local model in transformers.js
// local-models mode → no network), the embedding-only query expansion,
// `rank` with no resolver hit — must land the curated top-1 of each
// sanity-fixture.json query.
//
// The fixture itself is generated in oracle mode (Node embedder, resolver
// hit as input) by nlp/fixtures.ts; its exact reproduction and the invariants
// (floor, margin) are `tests/nlp/fixtures.test.ts`. Here the score check is
// loose: product mode passes no resolver hit, so a curated query the
// resolver resolves would score `derivedBoosts(...).resolver` below the
// fixture (none does today), and the browser pipeline's numerics may drift
// from the Node embedder's by a little (measured ~0 on these queries). The
// lookup-map promote of `search.ts` is not replayed: no curated query is a
// bare canonical form, so it could not fire.
//
// Fast (~1-2s) despite the 127 MB model: Node uses native onnxruntime-node
// on the local mmap'd model — the "~127 MB download" is the browser's
// first-visit cost, not this test. Skipped if artifacts aren't staged.

import { dirname } from 'node:path';
import { isNonEmpty } from '@carlwr/typescript-extra';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRulesYaml } from '../nlp/rules-load';
import { embedQuery, type FeatureExtractionPipeline } from '../src/lib/embedder';
import { errMsg } from '../src/lib/errors';
import { expandQueryForEmbedding } from '../src/lib/ranker/query-expand';
import { rank } from '../src/lib/ranker/rank';
import type { Rules } from '../src/lib/ranker/rules';
import { derivedBoosts, type VectorIndex } from '../src/lib/ranker/types';
import { artifactGate, loadIndexFromDisk, loadSanityFixture, PATHS, STAGED } from './_helpers';

const skipReason = artifactGate('full-pipeline sanity', [STAGED.index, STAGED.model]);

// Browser pipeline vs Node embedder, in score units.
const EMBEDDER_DRIFT = 0.01;

describe('full-pipeline sanity', () => {
  let index: VectorIndex;
  let rules: Rules;
  let pipe: FeatureExtractionPipeline | null = null;
  let pipeErr = '';

  beforeAll(async () => {
    if (skipReason) return;
    [index, rules] = await Promise.all([loadIndexFromDisk(), loadRulesYaml()]);
    try {
      pipe = await loadLocalPipeline();
    } catch (e) {
      pipeErr = errMsg(e);
      console.warn(`[sanity] pipeline load failed: ${pipeErr}`);
    }
  }, 180_000);

  it('top-1 matches curated identity', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);

    if (!pipe) {
      throw new Error(`pipeline load failed: ${pipeErr}`);
    }
    const fixture = await loadSanityFixture();
    expect(fixture.entries.length).toBeGreaterThan(0);
    const slack = derivedBoosts(rules.tuning.boosts).resolver + EMBEDDER_DRIFT;
    for (const entry of fixture.entries) {
      const v = await embedQuery(
        expandQueryForEmbedding(entry.query, rules.synonyms.query_expansions),
        pipe
      );
      const ranked = rank(entry.query, v, null, null, index, rules);
      if (!isNonEmpty(ranked)) throw new Error(`no matches for query: ${entry.query}`);
      const got = ranked[0];
      expect(
        { category: got.rec.category, id: got.rec.id },
        `query: ${entry.query}`
      ).toEqual({ category: entry.topMatch.category, id: entry.topMatch.id });
      expect(got.score).toBeGreaterThanOrEqual(fixture.invariants.absoluteFloor - slack);
    }
  }, 180_000);
});

async function loadLocalPipeline(): Promise<FeatureExtractionPipeline> {
  const tx = await import('@huggingface/transformers');
  tx.env.allowRemoteModels = false;
  tx.env.allowLocalModels = true;
  // transformers.js resolves `<localModelPath>/<modelId>` — point one level
  // up from PATHS.modelDir so the modelId is the leaf dir name ("model").
  tx.env.localModelPath = dirname(PATHS.modelDir);
  return (await tx.pipeline('feature-extraction', 'model', {
    dtype: 'fp32'
  })) as unknown as FeatureExtractionPipeline;
}
