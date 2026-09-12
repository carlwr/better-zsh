// Node embedder over the local model: shape and unit norm, determinism,
// truncation of an over-long input, and padded batches reproducing the
// single-text vectors. Skipped without the model (`scripts/fetch-model`);
// `normalizeF32` and the fetch script's model-id pin always run.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createNodeEmbedder,
  DIMS,
  type Embedder,
  embedQuery,
  embedUnique,
  MODEL_ID,
  normalizeF32
} from '../../nlp/embedder-node';
import { loadRulesYaml } from '../../nlp/rules-load';
import { artifactGate, STAGED } from '../_helpers';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A few f32 ulps: the norm of a normalized 384-vector re-summed in f64.
const UNIT_TOL = 1e-6;
// Two padded batches of the same text differ by ~1e-7 per component.
const SAME_MIN_COSINE = 0.999999;

function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function expectUnit(v: Float32Array): void {
  expect(v.length).toBe(DIMS);
  expect(Math.abs(Math.sqrt(cosine(v, v)) - 1)).toBeLessThanOrEqual(UNIT_TOL);
}

describe('normalizeF32', () => {
  it('makes a unit vector, in place', () => {
    const v = new Float32Array([3, 4]);
    expect(normalizeF32(v)).toBe(v);
    expect([...v]).toEqual([Math.fround(0.6), Math.fround(0.8)]);
  });

  it('leaves the zero vector alone', () => {
    expect([...normalizeF32(new Float32Array(3))]).toEqual([0, 0, 0]);
  });
});

/** The fetch script names the model too (a shell script cannot import it); `MODEL_ID` is the definition. */
it('fetch-model pins MODEL_ID', () => {
  const script = readFileSync(resolve(pkgDir, 'scripts', 'fetch-model'), 'utf8');
  expect(/^repo=(\S+)/m.exec(script)?.[1]).toBe(MODEL_ID);
});

const skipReason = artifactGate('node embedder', [STAGED.model]);

describe('node embedder', () => {
  let e: Embedder;
  const one = async (text: string): Promise<Float32Array> => {
    const [v] = await e.embed([text]);
    if (!v) throw new Error('no vector');
    return v;
  };

  beforeAll(async () => {
    if (skipReason) return;
    e = await createNodeEmbedder();
  }, 120_000);

  const overLong = `passage: ${'the history file '.repeat(200)}`;
  const texts = ['passage: cd to a directory by typing its name', 'passage: setopt', overLong];

  it('returns DIMS-long unit vectors', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    expectUnit(await one('query: change directory'));
  }, 60_000);

  it('is deterministic', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    expect(await one('query: glob qualifiers')).toEqual(await one('query: glob qualifiers'));
  }, 60_000);

  it('truncates an input over the token limit', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    expect(overLong.split(' ').length).toBeGreaterThan(512);
    expectUnit(await one(overLong));
  }, 60_000);

  it('embeds a padded batch as it embeds each text alone', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const batched = await e.embed(texts);
    expect(batched).toHaveLength(texts.length);
    for (const [i, text] of texts.entries()) {
      const v = batched[i] ?? new Float32Array();
      expect(cosine(v, await one(text)), `text ${i}`).toBeGreaterThanOrEqual(SAME_MIN_COSINE);
    }
  }, 60_000);

  it('embedUnique dedups in first-occurrence order and agrees with embedQuery', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const rules = await loadRulesYaml();
    const map = await embedUnique(e, ['change directory', 'glob qualifiers', 'change directory'], rules);
    expect([...map.keys()]).toEqual(['change directory', 'glob qualifiers']);
    const single = await embedQuery(e, 'glob qualifiers', rules);
    expectUnit(single);
    const fromMap = map.get('glob qualifiers') ?? new Float32Array();
    expect(cosine(single, fromMap)).toBeGreaterThanOrEqual(SAME_MIN_COSINE);
  }, 60_000);
});
