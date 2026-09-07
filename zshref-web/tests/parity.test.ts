// Parity test: TS ranker, fed the miniature index and pre-computed query
// vectors that parity-fixture.json carries, must produce byte-equal (at f32
// precision) ranked scores matching the fixture. No embedder and no staged
// artifacts — this isolates the ranker mirror from embedder drift between
// Rust ort and JS ORT-Web, and keeps the mirror contract inside ordinary CI.
//
// "Byte-equal at f32 precision" means: TS score Math.fround equals Rust
// score Math.fround. Both sides do every arithmetic op at f32 precision
// (Rust natively, TS via Math.fround), so the values must match the f32
// closest to whatever the chain yields.

import { describe, expect, it, beforeAll } from 'vitest';

import { loadParityFixture, loadRulesFromDisk } from './_helpers';
import { rank } from '../src/lib/ranker/rank';
import type { Rules } from '../src/lib/ranker/rules';

describe('ranker parity', () => {
  let rules: Rules;

  beforeAll(async () => {
    rules = await loadRulesFromDisk();
  });

  it('reproduces fixture scores at f32 precision', async () => {
    const fixture = await loadParityFixture();
    // A regeneration that emitted nothing would otherwise loop zero times.
    expect(fixture.entries.length).toBeGreaterThan(0);
    expect(fixture.index.records.length).toBeGreaterThan(0);
    for (const entry of fixture.entries) {
      const queryVec = new Float32Array(entry.queryVec);
      const resolverHit = entry.resolverHit ?? null;
      const ranked = rank(entry.query, queryVec, resolverHit, null, fixture.index, rules);
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
