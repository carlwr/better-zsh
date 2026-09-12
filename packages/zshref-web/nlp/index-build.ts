// The vector index: build from the corpus (embed the three retrieval-text
// views per record), validate against the corpus it claims to be built from,
// read and write `index.json`. Ported from zshref-rs/src/nlp/index.rs; the
// browser reads the file through `src/lib/ranker/index-loader.ts`.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { DocCorpus } from '@carlwr/zsh-core';

import { loadVectorIndex } from '../src/lib/ranker/index-loader';
import type { Rules } from '../src/lib/ranker/rules';
import type { IndexedRecord, VectorIndex, ViewVectors } from '../src/lib/ranker/types';
import { corpusHash } from './corpus-hash';
import { DIMS, type Embedder, INDEX_EMBED_CHUNK, MODEL_ID, normalizeF32 } from './embedder-node';
import { f32VecJson } from './json-f32';
import { corpusTexts } from './retrieval-text';

export const INDEX_VERSION = 2;

/** The embedded views, in the order their texts are embedded per record. */
export const VIEWS = ['structured', 'body', 'expanded'] as const;
export type View = (typeof VIEWS)[number];

/** One vector per view, from `f`; the keys are exactly `VIEWS`. */
export const viewVectors = (f: (view: View, at: number) => Float32Array<ArrayBuffer>): ViewVectors =>
  Object.fromEntries(VIEWS.map((view, at) => [view, f(view, at)])) as ViewVectors;

export type IndexValidation = { ok: true } | { ok: false; reason: string };

export interface BuildInputs {
  corpus: DocCorpus;
  rules: Rules;
  embedder: Embedder;
  /** After each embedded chunk: texts done so far, of how many. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Embed every record's views (`passage: ` + text; the embedder owns the
 * batch shape, which is part of the vectors' numerics — the
 * `INDEX_EMBED_CHUNK` slices here only pace `onProgress`), re-normalize in
 * f32, stamp the corpus hash, validate. Minutes on CPU for the whole corpus.
 */
export async function buildIndex({ corpus, rules, embedder, onProgress }: BuildInputs): Promise<VectorIndex> {
  const texts = corpusTexts(corpus, rules.synonyms.index_groups);
  const viewTexts = texts.flatMap((rec) => VIEWS.map((view) => `passage: ${rec[view]}`));
  const vectors: Float32Array<ArrayBuffer>[] = [];
  for (let at = 0; at < viewTexts.length; at += INDEX_EMBED_CHUNK) {
    vectors.push(...(await embedder.embed(viewTexts.slice(at, at + INDEX_EMBED_CHUNK))));
    onProgress?.(Math.min(at + INDEX_EMBED_CHUNK, viewTexts.length), viewTexts.length);
  }
  if (vectors.length !== viewTexts.length) {
    throw new Error(`model returned ${vectors.length} vectors for ${viewTexts.length} retrieval views`);
  }
  for (const v of vectors) normalizeF32(v);

  // `vectors` is flat: record-major, `VIEWS` order within.
  const vec = (k: number): Float32Array<ArrayBuffer> => {
    const v = vectors[k];
    if (!v) throw new Error('vector count checked');
    return v;
  };
  const records: IndexedRecord[] = texts.map((text, i) => ({
    text,
    vectors: viewVectors((_, at) => vec(i * VIEWS.length + at))
  }));

  const index: VectorIndex = {
    version: INDEX_VERSION,
    model: MODEL_ID,
    dims: DIMS,
    normalized: true,
    corpus_hash: corpusHash(corpus),
    records
  };
  const check = validateIndex(index, corpus, rules);
  if (!check.ok) throw new Error(check.reason);
  return index;
}

/**
 * Is `index` an index of this corpus under these rules? Checks in the Rust
 * order: version, model, dims, corpus hash, the normalized flag, record count,
 * then per record the full retrieval text and every view's length. No
 * unit-length check — the flag is trusted.
 */
export function validateIndex(index: VectorIndex, corpus: DocCorpus, rules: Rules): IndexValidation {
  const fail = (reason: string): IndexValidation => ({ ok: false, reason });
  if (index.version !== INDEX_VERSION) return fail(`unsupported nlp index version ${index.version}`);
  if (index.model !== MODEL_ID) return fail(`nlp index model is ${index.model}, expected ${MODEL_ID}`);
  if (index.dims !== DIMS) return fail(`nlp index dims is ${index.dims}, expected ${DIMS}`);
  if (index.corpus_hash !== corpusHash(corpus)) {
    return fail('nlp index corpus hash does not match this corpus; rebuild it');
  }
  if (!index.normalized) return fail('nlp index vectors are not marked normalized');
  const expected = corpusTexts(corpus, rules.synonyms.index_groups);
  if (index.records.length !== expected.length) {
    return fail(`nlp index has ${index.records.length} records, expected ${expected.length}; rebuild it`);
  }
  for (const [i, rec] of index.records.entries()) {
    const want = expected[i];
    if (want === undefined || !isDeepStrictEqual(rec.text, want)) {
      return fail(
        `nlp index record ${i} is ${rec.text.category}/${rec.text.id}, expected ${want?.category}/${want?.id}; rebuild it`
      );
    }
    for (const view of VIEWS) {
      const len = rec.vectors[view].length;
      if (len !== DIMS) return fail(`record ${i} view ${view} has ${len} dims, expected ${DIMS}`);
    }
  }
  return { ok: true };
}

/** `index.json` as serde wrote it: compact, key order as the Rust structs,
 * each vector component the shortest decimal for its f32. */
export function indexJson(index: VectorIndex): string {
  const { version, model, dims, normalized, corpus_hash } = index;
  const head = JSON.stringify({ version, model, dims, normalized, corpus_hash });
  const record = (r: IndexedRecord) =>
    `{"text":${JSON.stringify(r.text)},"vectors":{${VIEWS.map((v) => `"${v}":${f32VecJson(r.vectors[v])}`).join(',')}}}`;
  return `${head.slice(0, -1)},"records":[${index.records.map(record).join(',')}]}`;
}

export async function writeIndex(path: string, index: VectorIndex): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, indexJson(index));
}

/** Parse + schema-validate; `validateIndex` is the caller's, as in Rust `load`. */
export async function readIndex(path: string): Promise<VectorIndex> {
  return loadVectorIndex(JSON.parse(await readFile(path, 'utf8')));
}
