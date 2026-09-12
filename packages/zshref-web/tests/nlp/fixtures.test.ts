// The fixture generators against their committed files (rewrite under
// `UPDATE_PARITY_FIXTURE=1` / `UPDATE_SANITY_FIXTURE=1`), the synthetic
// vectors, and the sanity invariants. The parity side is self-contained
// (generated vectors, corpus in-process); the sanity build needs the staged
// index and the model, and skips without them.

import { loadCorpus } from '@carlwr/zsh-core';
import { beforeAll, describe, expect, it } from 'vitest';

import { createNodeEmbedder } from '../../nlp/embedder-node';
import {
  buildParityFixture,
  buildSanityFixture,
  fixtureJson,
  loadSanityFixture,
  renderSanity,
  type SanityFixture,
  sanityFailures,
  syntheticVec
} from '../../nlp/fixtures';
import { loadRulesYaml } from '../../nlp/rules-load';
import { artifactGate, assertCommittedJson, loadIndexFromDisk, PATHS, STAGED } from '../_helpers';

const corpus = loadCorpus();

describe('parity fixture', () => {
  it('parity_fixture_matches_committed', async () => {
    const fixture = buildParityFixture(corpus, await loadRulesYaml());
    await assertCommittedJson(PATHS.parityFixture, fixture, 'UPDATE_PARITY_FIXTURE', fixtureJson);
  });

  it('synthetic_vec_is_deterministic_and_unit', () => {
    const v = syntheticVec(['option', 'autocd', 'body']);
    expect(v).toEqual(syntheticVec(['option', 'autocd', 'body']));
    let sum = 0;
    for (const x of v) sum += x * x;
    expect(Math.abs(Math.sqrt(sum) - 1)).toBeLessThanOrEqual(1e-6);
    // Keyed by identity; the part separator keeps ("ab","c") off ("a","bc").
    expect(syntheticVec(['option', 'autocd', 'expanded'])).not.toEqual(v);
    expect(syntheticVec(['ab', 'c'])).not.toEqual(syntheticVec(['a', 'bc']));
  });
});

describe('sanity fixture', () => {
  const skipReason = artifactGate('sanity fixture build', [STAGED.index, STAGED.model]);
  let fresh: SanityFixture;

  beforeAll(async () => {
    if (skipReason) return;
    const [index, rules, embedder] = await Promise.all([
      loadIndexFromDisk(),
      loadRulesYaml(),
      createNodeEmbedder()
    ]);
    fresh = await buildSanityFixture({ corpus, index, rules, embedder });
  }, 180_000);

  // A rebuilt fixture against the committed one: identities exact, scores
  // within the embedder's drift — the tolerance the exact check below does
  // not have, so an embedder runtime change shows here as a delta, not as
  // a diff.
  it('sanity_fixture_reproduces_committed_within_eps', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const committed = await loadSanityFixture();
    const ids = (s: { category: string; id: string } | undefined) => s && { category: s.category, id: s.id };
    let maxDelta = 0;
    expect(fresh.entries.length).toBe(committed.entries.length);
    for (const [i, got] of fresh.entries.entries()) {
      const want = committed.entries[i];
      if (!want) throw new Error('length checked');
      expect(got.query).toBe(want.query);
      expect(ids(got.topMatch), got.query).toEqual(ids(want.topMatch));
      expect(ids(got.runnerUp), got.query).toEqual(ids(want.runnerUp));
      maxDelta = Math.max(
        maxDelta,
        Math.abs(got.topMatch.score - want.topMatch.score),
        Math.abs((got.runnerUp?.score ?? 0) - (want.runnerUp?.score ?? 0))
      );
    }
    console.log(`[sanity eps] max |Δscore| = ${maxDelta.toExponential(3)}`);
    expect(maxDelta).toBeLessThanOrEqual(1e-5);
  });

  it('sanity_fixture_matches_committed', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    await assertCommittedJson(PATHS.sanityFixture, fresh, 'UPDATE_SANITY_FIXTURE', fixtureJson);
  });

  // Over the committed file, so it always runs: identity as curated, top
  // above the floor, margin over the runner-up. Failure → re-curate the
  // query list; do not relax the invariants.
  it('sanity_invariants_hold', async () => {
    const fixture = await loadSanityFixture();
    console.log(renderSanity(fixture).trimEnd());
    expect(sanityFailures(fixture)).toEqual([]);
  });
});
