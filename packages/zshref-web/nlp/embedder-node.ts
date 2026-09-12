// Node-side BGE-small embedder: @huggingface/transformers on onnxruntime-node
// over the pinned local model (`scripts/fetch-model` → `.aux/model/`), for
// the index build, the evals and the model-gated tests. The browser keeps its
// own pipeline (src/lib/embedder.ts); this one defines the index's numerics:
//
// - HF-tokenizers truncation: content cut to 510 tokens, then `[CLS] … [SEP]`.
//   The pipeline's own truncation cuts after adding the specials, which drops
//   `[SEP]` from a long body and moves its vector by ~1e-2 in cosine.
// - CLS pooling (first token of `last_hidden_state`), fp32.
// - L2 normalization in f32, sequential (`normalizeF32`). Callers
//   re-normalize (index build, query embedding); f32 makes both idempotent
//   up to an ulp.
// - Padded batches with an attention mask, `INDEX_EMBED_CHUNK` texts each —
//   the batch shape is part of the vectors' numerics (~1e-7 against single
//   texts), so a rebuilt index reproduces the committed sanity fixture and
//   the recorded oracle captures only in these chunks. Padding to the
//   longest row makes a batch slower than its texts one by one on CPU (~4×
//   measured); dropping batching is a recorded follow-up (re-embeds).

import { basename, dirname } from 'node:path';
import {
  AutoModel,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  Tensor
} from '@huggingface/transformers';

import { DIMS, MODEL_ID } from '../src/lib/embedder';
import { expandQueryForEmbedding } from '../src/lib/ranker/query-expand';
import type { Rules } from '../src/lib/ranker/rules';
import { PATHS } from './paths';

export { DIMS, MODEL_ID };

/** Texts per model call. */
export const INDEX_EMBED_CHUNK = 32;

// The model's sequence limit, and what is left for content once `[CLS]` and
// `[SEP]` are added.
const MAX_LENGTH = 512;
const CONTENT_MAX = MAX_LENGTH - 2;

export type Embedder = {
  /** One unit-length `DIMS` vector per text, in input order. */
  embed(texts: readonly string[]): Promise<Float32Array<ArrayBuffer>[]>;
};

/**
 * Unit-normalize `v` in place: f32 sequential `sqrt(Σx²)`, divide only if
 * the norm is positive. Returns `v`.
 */
export function normalizeF32<B extends ArrayBufferLike>(v: Float32Array<B>): Float32Array<B> {
  let sum = 0;
  for (const x of v) sum = Math.fround(sum + Math.fround(x * x));
  const norm = Math.fround(Math.sqrt(sum));
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / norm;
  return v;
}

type Loaded = {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
  cls: number;
  sep: number;
  pad: number;
};

async function load(modelDir: string): Promise<Loaded> {
  // transformers.js resolves `<localModelPath>/<modelId>`: point one level up
  // from the model dir so the model id is its leaf name.
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = dirname(modelDir);
  const id = basename(modelDir);
  const [tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(id),
    AutoModel.from_pretrained(id, { dtype: 'fp32' })
  ]);
  // The specials as the tokenizer adds them around an empty input.
  const [cls, sep] = tokenizer('', { add_special_tokens: true, return_tensor: false }).input_ids;
  if (cls === undefined || sep === undefined) {
    throw new Error('tokenizer adds no [CLS]/[SEP] pair around an empty input');
  }
  return { tokenizer, model, cls, sep, pad: tokenizer.pad_token_id };
}

/** One padded batch: token rows → CLS vectors, each unit-normalized. */
async function embedBatch(m: Loaded, texts: readonly string[]): Promise<Float32Array<ArrayBuffer>[]> {
  const contents = m.tokenizer([...texts], {
    add_special_tokens: false,
    truncation: true,
    max_length: CONTENT_MAX,
    return_tensor: false
  }).input_ids;
  const rows = contents.map((ids) => [m.cls, ...ids, m.sep]);
  const n = rows.length;
  const len = Math.max(...rows.map((r) => r.length));
  const ids = new BigInt64Array(n * len).fill(BigInt(m.pad));
  const mask = new BigInt64Array(n * len);
  rows.forEach((row, r) => {
    row.forEach((id, i) => {
      ids[r * len + i] = BigInt(id);
      mask[r * len + i] = 1n;
    });
  });
  const dims = [n, len];
  const out: { last_hidden_state: Tensor } = await m.model({
    input_ids: new Tensor('int64', ids, dims),
    attention_mask: new Tensor('int64', mask, dims),
    token_type_ids: new Tensor('int64', new BigInt64Array(n * len), dims)
  });
  const hidden = out.last_hidden_state;
  const width = hidden.dims[2];
  if (hidden.dims.length !== 3 || width !== DIMS || !(hidden.data instanceof Float32Array)) {
    throw new Error(`model output is ${hidden.type}[${hidden.dims.join('x')}], expected f32[..x..x${DIMS}]`);
  }
  const data = hidden.data;
  return rows.map((_, r) => {
    const at = r * len * width;
    return normalizeF32(data.slice(at, at + width));
  });
}

/** Load the local model once; `embed` batches in `INDEX_EMBED_CHUNK`s. */
export async function createNodeEmbedder(modelDir: string = PATHS.modelDir): Promise<Embedder> {
  const m = await load(modelDir);
  return {
    async embed(texts) {
      const vectors: Float32Array<ArrayBuffer>[] = [];
      for (let at = 0; at < texts.length; at += INDEX_EMBED_CHUNK) {
        vectors.push(...(await embedBatch(m, texts.slice(at, at + INDEX_EMBED_CHUNK))));
      }
      return vectors;
    }
  };
}

/** The text a query is embedded as: expanded (embedding-only synonyms), prefixed. */
export function queryEmbedText(query: string, rules: Rules): string {
  return `query: ${expandQueryForEmbedding(query, rules.synonyms.query_expansions)}`;
}

/** Embed one query as search does: expand, prefix, embed, normalize. */
export async function embedQuery(e: Embedder, query: string, rules: Rules): Promise<Float32Array> {
  const [v] = await e.embed([queryEmbedText(query, rules)]);
  if (!v) throw new Error(`embedder returned no vector for query ${JSON.stringify(query)}`);
  return normalizeF32(v);
}

/**
 * Embed every distinct query once (batched), keyed by the query string in
 * first-occurrence order — for evals whose entries share query strings.
 */
export async function embedUnique(
  e: Embedder,
  queries: readonly string[],
  rules: Rules
): Promise<Map<string, Float32Array>> {
  const unique = [...new Set(queries)];
  const vectors = await e.embed(unique.map((q) => queryEmbedText(q, rules)));
  const out = new Map<string, Float32Array>();
  for (const [i, q] of unique.entries()) {
    const v = vectors[i];
    if (!v) throw new Error(`embedder returned ${vectors.length} vectors for ${unique.length} queries`);
    out.set(q, normalizeF32(v));
  }
  return out;
}
