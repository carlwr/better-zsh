// Index build: f32 number printing, `writeIndex` → `readIndex` round trip,
// and validation — its check order on a synthetic index (pure, always runs),
// and `validate_rejects_tampered_index` as the Rust suite had it, on the
// built index (skipped until `build:index` has run).

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCorpus } from '@carlwr/zsh-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { corpusHash } from '../../nlp/corpus-hash';
import { DIMS, MODEL_ID } from '../../nlp/embedder-node';
import {
  INDEX_VERSION,
  type IndexValidation,
  indexJson,
  readIndex,
  VIEWS,
  validateIndex,
  writeIndex
} from '../../nlp/index-build';
import { f32Shortest, f32VecJson } from '../../nlp/json-f32';
import { corpusTexts } from '../../nlp/retrieval-text';
import { loadRulesYaml } from '../../nlp/rules-load';
import type { Rules } from '../../src/lib/ranker/rules';
import type { IndexedRecord, VectorIndex } from '../../src/lib/ranker/types';
import { artifactGate, PATHS, STAGED } from '../_helpers';

const corpus = loadCorpus();
let rules: Rules;
beforeAll(async () => {
  rules = await loadRulesYaml();
});

const rejected = (v: IndexValidation, reason: RegExp): void => {
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.reason).toMatch(reason);
};

describe('f32Shortest', () => {
  it('prints the obvious cases', () => {
    const cases: [number, string][] = [
      [0.5, '0.5'],
      [1, '1'],
      [-0, '0'],
      [Math.fround(0.1), '0.1'],
      [Math.fround(-0.023456), '-0.023456'],
      [Math.fround(1.5e-7), '1.5e-7']
    ];
    for (const [v, s] of cases) expect(f32Shortest(v), String(v)).toBe(s);
  });

  it('rejects what JSON cannot carry or an f32 cannot hold', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, 0.1, 1e40]) {
      expect(() => f32Shortest(v), String(v)).toThrow(/not a finite f32/);
    }
  });

  // Random bit patterns (a fixed xorshift seed): subnormals, huge and tiny
  // values included; every printed form reads back to the same f32 and
  // carries at most 9 significant digits.
  it('round-trips random f32 bit patterns', () => {
    const bits = new Uint32Array(1);
    const asF32 = new Float32Array(bits.buffer);
    let x = 0x9e3779b9;
    const next = (): number => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      bits[0] = x >>> 0;
      return asF32[0] ?? 0;
    };
    let checked = 0;
    while (checked < 5000) {
      const v = next();
      if (!Number.isFinite(v)) continue;
      const s = f32Shortest(v);
      expect(Math.fround(Number(s)), s).toBe(v);
      expect(s.replace(/e[+-]\d+$/, '').replace(/[-.]/g, '').replace(/^0+/, '').length).toBeLessThanOrEqual(9);
      checked++;
    }
  });

  it('f32VecJson is a JSON array of the components', () => {
    expect(f32VecJson(new Float32Array([0.5, -1, Math.fround(0.1)]))).toBe('[0.5,-1,0.1]');
    expect(f32VecJson(new Float32Array())).toBe('[]');
  });
});

const tinyIndex = (): VectorIndex => {
  const text = (id: string, subKind?: string) => ({
    category: 'option',
    category_label: 'option',
    id,
    display: id.toUpperCase(),
    ...(subKind === undefined ? {} : { sub_kind: subKind }),
    title: `\`${id}\``,
    md_body: 'body',
    structured: `id: ${id}`,
    body: `${id} does things`,
    expanded: 'option'
  });
  const vectors = (seed: number) => ({
    structured: new Float32Array([seed, 0.5, -0.25]),
    body: new Float32Array([Math.fround(0.1), seed, 1e-7]),
    expanded: new Float32Array([0, 0.75, Math.fround(seed * 0.3)])
  });
  return {
    version: INDEX_VERSION,
    model: MODEL_ID,
    dims: 3,
    normalized: true,
    corpus_hash: 'ab'.repeat(32),
    records: [
      { text: text('autocd'), vectors: vectors(1) },
      { text: text('globdots', 'x'), vectors: vectors(2) }
    ]
  };
};

describe('indexJson / writeIndex / readIndex', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'index-build-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('is compact, in the Rust key order, with shortest-f32 components', () => {
    const json = indexJson(tinyIndex());
    expect(json).not.toContain('\n');
    expect(json.startsWith(`{"version":${INDEX_VERSION},"model":"${MODEL_ID}","dims":3,"normalized":true,"corpus_hash":"`)).toBe(true);
    expect(json).toContain('"records":[{"text":{"category":"option",');
    expect(json).toContain('"vectors":{"structured":[1,0.5,-0.25],"body":[0.1,1,1e-7],"expanded":[0,0.75,0.3]}}');
  });

  it('round-trips through the production loader', async () => {
    const index = tinyIndex();
    const path = join(dir, 'nested', 'index.json');
    await writeIndex(path, index);
    expect(await readIndex(path)).toEqual(index);
  });
});

describe('validateIndex', () => {
  // A structurally valid index of this corpus without the model: the vectors
  // are zero (no unit-length check, by design — the flag is trusted).
  const zeroIndex = (): VectorIndex => ({
    version: INDEX_VERSION,
    model: MODEL_ID,
    dims: DIMS,
    normalized: true,
    corpus_hash: corpusHash(corpus),
    records: corpusTexts(corpus, rules.synonyms.index_groups).map((text) => ({
      text,
      vectors: { structured: new Float32Array(DIMS), body: new Float32Array(DIMS), expanded: new Float32Array(DIMS) }
    }))
  });

  it('accepts a zero-vector index of this corpus', () => {
    expect(validateIndex(zeroIndex(), corpus, rules)).toEqual({ ok: true });
  });

  it('checks in the Rust order, header before records', () => {
    const base = zeroIndex();
    const first = base.records[0];
    if (!first) throw new Error('empty corpus');
    const tamperedText: IndexedRecord = { ...first, text: { ...first.text, body: `${first.text.body} x` } };
    const cases: [string, Partial<VectorIndex>, RegExp][] = [
      ['version', { version: 1, model: 'other' }, /unsupported nlp index version 1/],
      ['model', { model: 'other', dims: 1 }, /model is other, expected/],
      ['dims', { dims: 1, corpus_hash: 'x' }, /dims is 1, expected/],
      ['corpus hash', { corpus_hash: 'x', normalized: false }, /corpus hash does not match/],
      ['normalized', { normalized: false, records: [] }, /not marked normalized/],
      ['record count', { records: base.records.slice(1) }, /has \d+ records, expected \d+/],
      [
        'record text',
        { records: [tamperedText, ...base.records.slice(1)] },
        new RegExp(`record 0 is ${first.text.category}/${first.text.id}, expected ${first.text.category}/`)
      ]
    ];
    for (const [label, patch, reason] of cases) {
      const v = validateIndex({ ...base, ...patch }, corpus, rules);
      expect(v.ok, label).toBe(false);
      if (!v.ok) expect(v.reason, label).toMatch(reason);
    }
  });

  // The rules are an input of the expected text: a synonym group the index
  // was not built with changes some record's expanded view.
  it('rejects an index built under other synonym groups', () => {
    const group = ['autocd', 'a synonym no record mentions'];
    const other: Rules = { ...rules, synonyms: { ...rules.synonyms, index_groups: [group] } };
    rejected(validateIndex(zeroIndex(), corpus, other), /nlp index record \d+ is /);
  });
});

const skipReason = artifactGate('built index', [STAGED.index]);

describe('built index', () => {
  it('validate_rejects_tampered_index', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const index = await readIndex(PATHS.indexJson);
    expect(validateIndex(index, corpus, rules)).toEqual({ ok: true });

    rejected(validateIndex({ ...index, corpus_hash: '0'.repeat(64) }, corpus, rules), /corpus hash/);
    rejected(validateIndex({ ...index, records: index.records.slice(0, -1) }, corpus, rules), /records, expected/);

    const [first, ...rest] = index.records;
    if (!first) throw new Error('empty index');
    const truncated: IndexedRecord = {
      ...first,
      vectors: { ...first.vectors, body: first.vectors.body.slice(0, 1) }
    };
    rejected(validateIndex({ ...index, records: [truncated, ...rest] }, corpus, rules), /view body has 1 dims/);
  });

  it('every vector is unit length with the declared dims', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const index = await readIndex(PATHS.indexJson);
    let worst = 0;
    for (const rec of index.records) {
      for (const view of VIEWS) {
        const v = rec.vectors[view];
        expect(v.length).toBe(index.dims);
        let s = 0;
        for (const x of v) s += x * x;
        worst = Math.max(worst, Math.abs(Math.sqrt(s) - 1));
      }
    }
    expect(worst).toBeLessThanOrEqual(1e-6);
  });
});
