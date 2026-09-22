// The vector index: build from the corpus (embed the three retrieval-text
// views per record), validate against the corpus it claims to be built from,
// read and write `index.json`.

import { isDeepStrictEqual } from "node:util"
import type { DocCorpus } from "@carlwr/zsh-core"

import type { Rules } from "../core/rules"
import {
  DIMS,
  type IndexedRecord,
  loadVectorIndex,
  MODEL_ID,
  perView,
  type VectorIndex,
  VIEWS,
} from "../core/types"
import { normalizeF32 } from "../core/vec"
import type { Embedder } from "./embedder-node"
import { readJson, writeFileDeep } from "./io"
import { f32VecJson, jsonWithRawField } from "./json-f32"
import { corpusFingerprint } from "./projection"
import { corpusTexts } from "./retrieval-text"

export const INDEX_VERSION = 2

/** Texts per `embed` call during a build; paces `onProgress` only. */
export const PROGRESS_CHUNK = 32

export type IndexValidation = { ok: true } | { ok: false; reason: string }

export interface BuildInputs {
  corpus: DocCorpus
  rules: Rules
  embedder: Embedder
  /** After each embedded chunk: texts done so far, of how many. */
  onProgress?: (done: number, total: number) => void
}

/** Embed every record's views. About a minute on CPU for the whole corpus. */
export async function buildIndex({
  corpus,
  rules,
  embedder,
  onProgress,
}: BuildInputs): Promise<VectorIndex> {
  const texts = corpusTexts(corpus, rules.synonyms.index_groups)
  const viewTexts = texts.flatMap(rec =>
    VIEWS.map(view => `passage: ${rec[view]}`),
  )
  const vectors: Float32Array<ArrayBuffer>[] = []
  for (let at = 0; at < viewTexts.length; at += PROGRESS_CHUNK) {
    vectors.push(
      ...(await embedder.embed(viewTexts.slice(at, at + PROGRESS_CHUNK))),
    )
    onProgress?.(
      Math.min(at + PROGRESS_CHUNK, viewTexts.length),
      viewTexts.length,
    )
  }
  if (vectors.length !== viewTexts.length) {
    throw new Error(
      `model returned ${vectors.length} vectors for ${viewTexts.length} retrieval views`,
    )
  }
  for (const v of vectors) normalizeF32(v)

  // `vectors` is flat: record-major, `VIEWS` order within.
  const vec = (k: number): Float32Array<ArrayBuffer> => {
    const v = vectors[k]
    if (!v) throw new Error("vector count checked")
    return v
  }
  const records: IndexedRecord[] = texts.map((text, i) => ({
    text,
    vectors: perView((_, at) => vec(i * VIEWS.length + at)),
  }))

  const index: VectorIndex = {
    version: INDEX_VERSION,
    model: MODEL_ID,
    dims: DIMS,
    normalized: true,
    corpus_hash: corpusFingerprint(corpus),
    records,
  }
  const check = validateIndex(index, corpus, rules)
  if (!check.ok) throw new Error(check.reason)
  return index
}

/**
 * Is `index` an index of this corpus under these rules? No unit-length
 * check — the `normalized` flag is trusted.
 */
export function validateIndex(
  index: VectorIndex,
  corpus: DocCorpus,
  rules: Rules,
): IndexValidation {
  const fail = (reason: string): IndexValidation => ({ ok: false, reason })
  if (index.version !== INDEX_VERSION)
    return fail(`unsupported nlp index version ${index.version}`)
  if (index.model !== MODEL_ID)
    return fail(`nlp index model is ${index.model}, expected ${MODEL_ID}`)
  if (index.dims !== DIMS)
    return fail(`nlp index dims is ${index.dims}, expected ${DIMS}`)
  if (index.corpus_hash !== corpusFingerprint(corpus)) {
    return fail("nlp index corpus hash does not match this corpus; rebuild it")
  }
  if (!index.normalized)
    return fail("nlp index vectors are not marked normalized")
  const expected = corpusTexts(corpus, rules.synonyms.index_groups)
  if (index.records.length !== expected.length) {
    return fail(
      `nlp index has ${index.records.length} records, expected ${expected.length}; rebuild it`,
    )
  }
  for (const [i, rec] of index.records.entries()) {
    const want = expected[i]
    if (want === undefined || !isDeepStrictEqual(rec.text, want)) {
      return fail(
        `nlp index record ${i} is ${rec.text.category}/${rec.text.id}, expected ${want?.category}/${want?.id}; rebuild it`,
      )
    }
    for (const view of VIEWS) {
      const len = rec.vectors[view].length
      if (len !== DIMS)
        return fail(
          `record ${i} view ${view} has ${len} dims, expected ${DIMS}`,
        )
    }
  }
  return { ok: true }
}

/** `index.json`: compact, fixed key order, each vector component the
 * shortest decimal for its f32 (`f32VecJson`). */
export function indexJson(index: VectorIndex): string {
  const { version, model, dims, normalized, corpus_hash } = index
  const vectors = (r: IndexedRecord) =>
    `{${VIEWS.map(v => `"${v}":${f32VecJson(r.vectors[v])}`).join(",")}}`
  const record = (r: IndexedRecord) =>
    jsonWithRawField({ text: r.text }, "vectors", vectors(r))
  return jsonWithRawField(
    { version, model, dims, normalized, corpus_hash },
    "records",
    `[${index.records.map(record).join(",")}]`,
  )
}

export const writeIndex = (path: string, index: VectorIndex): Promise<void> =>
  writeFileDeep(path, indexJson(index))

/** Parse + schema-validate; `validateIndex` is the caller's. */
export const readIndex = async (path: string): Promise<VectorIndex> =>
  loadVectorIndex(await readJson(path))
