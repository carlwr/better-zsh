// Parity test: TS ranker, fed pre-computed query vectors from
// parity-fixture.json, must produce byte-equal (at f32 precision) ranked
// scores matching the fixture. No embedder involved — this isolates the
// ranker mirror from any embedder drift between Rust ort and JS ORT-Web.
//
// "Byte-equal at f32 precision" means: TS score Math.fround equals Rust
// score Math.fround. Both sides do every arithmetic op at f32 precision
// (Rust natively, TS via Math.fround), so the values must match the f32
// closest to whatever the chain yields.

import { describe, expect, it, beforeAll } from 'vitest';

import {
  artifactGate,
  loadIndexFromDisk,
  loadParityFixture,
  loadRulesFromDisk
} from './_helpers';
import { rank } from '../src/lib/ranker/rank';
import type { Rules } from '../src/lib/ranker/rules';
import type { VectorIndex } from '../src/lib/ranker/types';

const skipReason = artifactGate('ranker parity');

describe('ranker parity', () => {
  let index: VectorIndex;
  let rules: Rules;

  beforeAll(async () => {
    if (skipReason) return;
    [index, rules] = await Promise.all([loadIndexFromDisk(), loadRulesFromDisk()]);
  }, 60_000);

  it('reproduces fixture scores at f32 precision', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);

    const fixture = await loadParityFixture();
    for (const entry of fixture.entries) {
      const queryVec = new Float32Array(entry.queryVec);
      const resolverHit = entry.resolverHit ?? null;
      const ranked = rank(entry.query, queryVec, resolverHit, null, index, rules);
      const got = ranked.slice(0, fixture.limit).map((m) => ({
        category: m.rec.category,
        id: m.rec.id,
        score: Math.fround(m.score)
      }));
      const want = entry.expected.map((e) => ({
        category: e.category,
        id: e.id,
        score: Math.fround(e.score)
      }));
      expect(got, `query: ${entry.query}`).toEqual(want);
    }
  });
});
