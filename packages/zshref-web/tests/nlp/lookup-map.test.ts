// Build side of the lookup map: drift against the committed JSON, and the
// canonical-form coverage over the asymmetric per-category surface-form
// shapes. Pure on corpus + resolver — no staged assets, always runs.

import { loadCorpus } from '@carlwr/zsh-core';
import { describe, expect, it } from 'vitest';
import { buildLookupMap } from '../../nlp/lookup-map-build';
import { LookupIndex } from '../../src/lib/ranker/lookup-map';
import { assertCommittedJson, PATHS } from '../_helpers';

const corpus = loadCorpus();

describe('lookup map', () => {
  // Regenerate and compare, or rewrite the committed file under UPDATE_LOOKUP_MAP=1.
  it('lookup_map_matches_committed', async () => {
    await assertCommittedJson(PATHS.lookupMap, buildLookupMap(corpus), 'UPDATE_LOOKUP_MAP');
  });

  it('known_canonical_forms_resolve', () => {
    const idx = new LookupIndex(buildLookupMap(corpus));
    const cases: readonly (readonly [string, string, string])[] = [
      ['AUTO_CD', 'option', 'autocd'],
      ['auto_cd', 'option', 'autocd'],
      ['autocd', 'option', 'autocd'],
      ['NO_AUTO_CD', 'option', 'autocd'],
      ['no_autocd', 'option', 'autocd'],
      ['setopt', 'builtin', 'setopt'],
      ['fc', 'builtin', 'fc'],
      ['chdir', 'builtin', 'chdir'],
      ['_arguments', 'comp_utility', '_arguments']
    ];
    for (const [raw, category, id] of cases) {
      expect(idx.lookup(raw), `lookup ${JSON.stringify(raw)}`).toEqual({ category, id });
    }
  });

  // `SETOPT` is not an enumerated builtin form (the canonical one is the
  // lowercase id), so it reaches `setopt` via the lowercase fallback.
  it('lowercase_fallback_resolves', () => {
    const idx = new LookupIndex(buildLookupMap(corpus));
    expect(idx.lookup('SETOPT')).toEqual({ category: 'builtin', id: 'setopt' });
  });
});
