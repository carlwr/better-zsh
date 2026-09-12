// Lookup-contract generation: drift against the committed JSON, and the
// bare-layer gate (every bare entry resolves via the lookup map). Pure on
// corpus + resolver — fast, and always runs, so drift in the surface-form
// table or in resolver canonicalization shows without embedder or index.

import { loadCorpus } from '@carlwr/zsh-core';
import { describe, expect, it } from 'vitest';
import { buildLookupContract, evalBare } from '../../nlp/contract';
import { buildLookupMap } from '../../nlp/lookup-map-build';
import { LookupIndex } from '../../src/lib/ranker/lookup-map';
import { assertCommittedJson, PATHS } from '../_helpers';

const corpus = loadCorpus();

describe('lookup contract', () => {
  // Regenerate and compare, or rewrite the committed file under UPDATE_LOOKUP_CONTRACT=1.
  it('lookup_contract_matches_committed', async () => {
    await assertCommittedJson(
      PATHS.lookupContract,
      buildLookupContract(corpus),
      'UPDATE_LOOKUP_CONTRACT'
    );
  });

  it('lookup_contract_holds', () => {
    const idx = new LookupIndex(buildLookupMap(corpus));
    const e = evalBare(buildLookupContract(corpus), idx);
    console.log(
      `[contract bare] ${e.bareTotal} entries, ${e.failures.length} failures (skipped ${e.skippedDecorated} decorated)`
    );
    expect(e.failures, e.failures.join('\n')).toEqual([]);
  });
});
