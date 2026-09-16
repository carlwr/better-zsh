// The fixture generators against their committed files. The parity side is
// self-contained (generated vectors, corpus in-process); the sanity build
// needs the staged index and the model, and skips without them.

import { loadCorpus } from '@carlwr/zsh-core';
import { describe, expect, it } from 'vitest';

import { createNodeEmbedder } from '../../nlp/embedder-node';
import {
  buildParityFixture,
  buildSanityFixture,
  fixtureJson,
  loadSanityFixture,
  renderSanity,
  sanityFailures,
  syntheticVec
} from '../../nlp/fixtures';
import { loadRulesYaml } from '../../nlp/rules-load';
import { artifactGate, assertCommittedJson, loadIndexFromDisk, PATHS, STAGED, withinDecimals } from '../_helpers';

const corpus = loadCorpus();

describe('parity fixture', () => {
  it('parity_fixture_matches_committed', async () => {
    const fixture = buildParityFixture(corpus, await loadRulesYaml());
    await assertCommittedJson(PATHS.parityFixture, fixture, 'UPDATE_PARITY_FIXTURE', { render: fixtureJson });
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

/** Decimals a rebuilt sanity score must agree to: the embedder runtime differs across platforms by ~1e-7. */
const SANITY_DECIMALS = 5;

describe('sanity fixture', () => {
  const skipReason = artifactGate('sanity fixture build', [STAGED.index, STAGED.model]);

  // Identities and structure exact, scores within `SANITY_DECIMALS`.
  it('sanity_fixture_reproduces_committed_within_eps', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const [index, rules, embedder] = await Promise.all([
      loadIndexFromDisk(),
      loadRulesYaml(),
      createNodeEmbedder()
    ]);
    const fresh = await buildSanityFixture({ index, rules, embedder });
    await assertCommittedJson(PATHS.sanityFixture, fresh, 'UPDATE_SANITY_FIXTURE', {
      render: fixtureJson,
      expected: (v) => withinDecimals(v, SANITY_DECIMALS)
    });
  }, 180_000);

  // Over the committed file, so it always runs: identity as curated, top
  // above the floor, margin over the runner-up. Failure → re-curate the
  // query list; do not relax the invariants.
  it('sanity_invariants_hold', async () => {
    const fixture = await loadSanityFixture();
    console.log(renderSanity(fixture).trimEnd());
    expect(sanityFailures(fixture)).toEqual([]);
  });
});
