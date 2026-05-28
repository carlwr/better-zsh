// Sanity test: TS full pipeline (production `embedQuery` + ranker) must
// produce the curated top-1 identity per query in sanity-fixture.json.
// Only the pipeline source is test-specific (loaded from
// zshref-rs/data-nlp/model via transformers.js local-models mode → no
// network dep).
//
// Margin contract (`minMargin`) is enforced Rust-side by
// `sanity_invariants_hold`; not re-asserted here.
//
// Fast (~1-2s) despite the 127 MB model: Node uses native onnxruntime-node
// on the local mmap'd model — the "~127 MB download" is the browser's
// first-visit cost, not this test. Skipped if artifacts aren't staged.

import { dirname } from 'node:path';
import { isNonEmpty } from '@carlwr/typescript-extra';
import { describe, expect, it, beforeAll } from 'vitest';

import {
  PATHS,
  artifactGate,
  loadIndexFromDisk,
  loadRulesFromDisk,
  loadSanityFixture
} from './_helpers';
import { rank } from '../src/lib/ranker/rank';
import { errMsg } from '../src/lib/errors';
import { embedQuery, type FeatureExtractionPipeline } from '../src/lib/embedder';
import type { Rules } from '../src/lib/ranker/rules';
import type { VectorIndex } from '../src/lib/ranker/types';

const skipReason = artifactGate('full-pipeline sanity');

describe('full-pipeline sanity', () => {
  let index: VectorIndex;
  let rules: Rules;
  let pipe: FeatureExtractionPipeline | null = null;
  let pipeErr = '';

  beforeAll(async () => {
    if (skipReason) return;
    [index, rules] = await Promise.all([loadIndexFromDisk(), loadRulesFromDisk()]);
    try {
      pipe = await loadLocalPipeline();
    } catch (e) {
      pipeErr = errMsg(e);
      console.warn(`[sanity] pipeline load failed: ${pipeErr}`);
    }
  }, 180_000);

  it.skipIf(skipReason)('top-1 matches curated identity', async () => {
    if (!pipe) {
      throw new Error(`pipeline load failed: ${pipeErr}`);
    }
    const fixture = await loadSanityFixture();
    expect(fixture.entries.length).toBeGreaterThan(0);
    for (const entry of fixture.entries) {
      const v = await embedQuery(entry.query, pipe);
      const ranked = rank(entry.query, v, null, null, index, rules);
      if (!isNonEmpty(ranked)) throw new Error(`no matches for query: ${entry.query}`);
      const got = ranked[0];
      expect(
        { category: got.rec.category, id: got.rec.id },
        `query: ${entry.query}`
      ).toEqual({ category: entry.topMatch.category, id: entry.topMatch.id });
      // -0.05 absorbs f32 drift between Rust ort and JS ORT-Web.
      expect(got.score).toBeGreaterThanOrEqual(fixture.invariants.absoluteFloor - 0.05);
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
