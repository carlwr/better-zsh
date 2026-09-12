// `corpus_hash`: a stable identity for the corpus an index was built from.
// The hash function is pinned on tiny inputs; the corpus-level wrapper only
// on shape and determinism (its value moves with every corpus change).

import { loadCorpus } from '@carlwr/zsh-core';
import { describe, expect, it } from 'vitest';

import type { HashInputs } from '../../nlp/corpus-hash';
import { corpusHash, hashInputs } from '../../nlp/corpus-hash';

const sha256Hex = /^[0-9a-f]{64}$/;

const inputs: HashInputs = {
  version: '0.1.0',
  tag: 'zsh-5.9',
  categories: [
    { name: 'option', records: [{ name: 'autocd', mdBody: 'a — b' }, { name: 'chaselinks' }] },
    { name: 'builtin', records: [] }
  ]
};

describe('hashInputs', () => {
  it('is 64 hex chars and deterministic', () => {
    const h = hashInputs(inputs);
    expect(h).toMatch(sha256Hex);
    expect(hashInputs(structuredClone(inputs))).toBe(h);
  });

  it('changes when a record, the order, the version or the tag changes', () => {
    const h = hashInputs(inputs);
    const changed: HashInputs[] = [
      { ...inputs, version: '0.1.1' },
      { ...inputs, tag: 'zsh-5.8' },
      { ...inputs, categories: [...inputs.categories].reverse() },
      {
        ...inputs,
        categories: [
          { name: 'option', records: [{ name: 'autocd', mdBody: 'a — c' }, { name: 'chaselinks' }] },
          { name: 'builtin', records: [] }
        ]
      },
      {
        ...inputs,
        categories: [
          { name: 'option', records: [{ name: 'chaselinks' }, { name: 'autocd', mdBody: 'a — b' }] },
          { name: 'builtin', records: [] }
        ]
      }
    ];
    for (const c of changed) expect(hashInputs(c)).not.toBe(h);
  });

  it('is field-delimited: shifting text between fields changes the hash', () => {
    const a = hashInputs({ version: 'ab', tag: 'c', categories: [] });
    const b = hashInputs({ version: 'a', tag: 'bc', categories: [] });
    expect(a).not.toBe(b);
  });
});

describe('corpusHash', () => {
  it('is 64 hex chars and deterministic over the loaded corpus', () => {
    const corpus = loadCorpus();
    const h = corpusHash(corpus);
    expect(h).toMatch(sha256Hex);
    expect(corpusHash(corpus)).toBe(h);
  });
});
