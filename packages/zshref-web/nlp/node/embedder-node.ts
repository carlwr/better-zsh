// Node-side BGE-small embedder: @huggingface/transformers on onnxruntime-node
// over the pinned local model (`scripts/fetch-model` → `.aux/model/`). It
// defines the index's numerics:
//
// - HF-tokenizers truncation: content cut to 510 tokens, then `[CLS] … [SEP]`.
//   The pipeline's own truncation cuts after adding the specials, which drops
//   `[SEP]` from a long body and moves its vector by ~1e-2 in cosine.
// - CLS pooling (first token of `last_hidden_state`), fp32.
// - L2 normalization in f32, sequential (`normalizeF32`). Callers
//   re-normalize (index build, query embedding); f32 makes both idempotent
//   up to an ulp.
// - One text per model call, no padding: a vector is a function of its text
//   alone. Considered padded batches; the batch shape leaks into the
//   numerics (~1e-7), and padding to the longest row made a batch several
//   times slower than its texts one by one on CPU.

import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { hasAtleastTwo } from "@carlwr/typescript-extra"
import {
  AutoModel,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  Tensor,
} from "@huggingface/transformers"
import type { Rules } from "../core/rules"
import { queryEmbedText } from "../core/search"
import { DIMS, MODEL_ID } from "../core/types"
import { normalizeF32 } from "../core/vec"
import { PATHS } from "./paths"

// The model's sequence limit, and what is left for content once `[CLS]` and
// `[SEP]` are added.
const MAX_LENGTH = 512
const CONTENT_MAX = MAX_LENGTH - 2

export type Embedder = {
  /** One unit-length `DIMS` vector per text, in input order. */
  embed(texts: readonly string[]): Promise<Float32Array<ArrayBuffer>[]>
}

type Loaded = {
  tokenizer: PreTrainedTokenizer
  model: PreTrainedModel
  cls: number
  sep: number
}

/**
 * Point transformers.js at the on-disk model, Hub off. It resolves
 * `<localModelPath>/<modelId>`, so the id to load by is the dir's leaf
 * name: returned.
 */
export function useLocalModel(modelDir: string = PATHS.modelDir): string {
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = dirname(modelDir)
  return basename(modelDir)
}

async function load(modelDir: string): Promise<Loaded> {
  const id = useLocalModel(modelDir)
  const [tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(id),
    AutoModel.from_pretrained(id, { dtype: "fp32" }),
  ])
  // The specials as the tokenizer adds them around an empty input.
  const ids = tokenizer("", {
    add_special_tokens: true,
    return_tensor: false,
  }).input_ids
  if (!hasAtleastTwo(ids))
    throw new Error("tokenizer adds no [CLS]/[SEP] pair around an empty input")
  const [cls, sep] = ids
  return { tokenizer, model, cls, sep }
}

/** One text: its token row → the CLS vector, unit-normalized. */
async function embedOne(
  m: Loaded,
  text: string,
): Promise<Float32Array<ArrayBuffer>> {
  const content = m.tokenizer(text, {
    add_special_tokens: false,
    truncation: true,
    max_length: CONTENT_MAX,
    return_tensor: false,
  }).input_ids
  const row = [m.cls, ...content, m.sep]
  const len = row.length
  const dims = [1, len]
  const out: { last_hidden_state: Tensor } = await m.model({
    input_ids: new Tensor("int64", BigInt64Array.from(row, BigInt), dims),
    attention_mask: new Tensor("int64", new BigInt64Array(len).fill(1n), dims),
    token_type_ids: new Tensor("int64", new BigInt64Array(len), dims),
  })
  const hidden = out.last_hidden_state
  if (
    hidden.dims.length !== 3 ||
    hidden.dims[2] !== DIMS ||
    !(hidden.data instanceof Float32Array)
  ) {
    throw new Error(
      `model output is ${hidden.type}[${hidden.dims.join("x")}], expected f32[1x${len}x${DIMS}]`,
    )
  }
  return normalizeF32(hidden.data.slice(0, DIMS))
}

/** Load the local model once; `embed` runs one model call per text. */
export async function createNodeEmbedder(
  modelDir: string = PATHS.modelDir,
): Promise<Embedder> {
  const m = await load(modelDir)
  return {
    async embed(texts) {
      const vectors: Float32Array<ArrayBuffer>[] = []
      for (const text of texts) vectors.push(await embedOne(m, text))
      return vectors
    },
  }
}

/**
 * What a vector is a function of besides its text: the model id, the model
 * files (name, size, mtime), the runtime's version and this file's source.
 * Cached vectors carry it; a change drops them.
 */
export function embedderIdentity(modelDir: string = PATHS.modelDir): string {
  const h = createHash("sha256").update(MODEL_ID).update(env.version)
  const files = readdirSync(modelDir, { recursive: true, encoding: "utf8" })
  for (const f of files.sort()) {
    const st = statSync(join(modelDir, f))
    if (st.isFile()) h.update(`${f}:${st.size}:${st.mtimeMs}`)
  }
  return h.update(readFileSync(fileURLToPath(import.meta.url))).digest("hex")
}

/** Embed one text, re-normalized. */
export async function embedText(
  e: Embedder,
  text: string,
): Promise<Float32Array> {
  const [v] = await e.embed([text])
  if (!v)
    throw new Error(`embedder returned no vector for ${JSON.stringify(text)}`)
  return normalizeF32(v)
}

/** Embed one query as search does: expand, prefix, embed, normalize. */
export const embedQuery = (
  e: Embedder,
  query: string,
  rules: Rules,
): Promise<Float32Array> => embedText(e, queryEmbedText(query, rules))

/**
 * Embed every distinct query once, keyed by the query string in
 * first-occurrence order — for evals whose entries share query strings.
 */
export async function embedUnique(
  e: Embedder,
  queries: readonly string[],
  rules: Rules,
): Promise<Map<string, Float32Array>> {
  const unique = [...new Set(queries)]
  const vectors = await e.embed(unique.map(q => queryEmbedText(q, rules)))
  const out = new Map<string, Float32Array>()
  for (const [i, q] of unique.entries()) {
    const v = vectors[i]
    if (!v)
      throw new Error(
        `embedder returned ${vectors.length} vectors for ${unique.length} queries`,
      )
    out.set(q, normalizeF32(v))
  }
  return out
}
