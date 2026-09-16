// Query vectors kept across runs (`PATHS.queryCache`, gitignored): the eval
// sets change only with the corpus and the rules, so a repeat run embeds
// little or nothing. Keyed by a hash of the exact embedded text — the file
// holds no query, held-out ones included (NLP.md) — under an identity of the
// numerics (`embedderIdentity`), and dropped whole when that identity moves:
// a stale vector is never served. Written as new vectors arrive and at
// process exit, merged with the file (other processes write it too),
// atomically: a partial write is never read.

import { createHash } from "node:crypto"
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { z } from "zod"

import { DIMS } from "../core/types"
import type { Embedder } from "./embedder-node"
import { f32VecJson, jsonWithRawField } from "./json-f32"

const FILE_VERSION = 1

const QueryCacheSchema = z.object({
  version: z.literal(FILE_VERSION),
  identity: z.string(),
  vectors: z.record(z.string(), z.array(z.number()).length(DIMS)),
})

/** By `textKey`. */
export type QueryVectors = Map<string, Float32Array<ArrayBuffer>>

export const textKey = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex")

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

/** The vectors on disk under `identity`; empty when missing, unreadable or of another identity. */
export function loadQueryCache(path: string, identity: string): QueryVectors {
  const parsed = QueryCacheSchema.safeParse(readJson(path))
  if (!parsed.success || parsed.data.identity !== identity) return new Map()
  return new Map(
    Object.entries(parsed.data.vectors).map(([key, v]) => [
      key,
      new Float32Array(v),
    ]),
  )
}

export function saveQueryCache(
  path: string,
  identity: string,
  vectors: QueryVectors,
): void {
  const entries = [...vectors]
    .map(([key, v]) => `${JSON.stringify(key)}:${f32VecJson(v)}`)
    .join(",")
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(
    tmp,
    jsonWithRawField(
      { version: FILE_VERSION, identity },
      "vectors",
      `{${entries}}`,
    ),
  )
  renameSync(tmp, path)
}

// A batch of this many misses writes at once (the write is a fraction of
// the embedding it follows); smaller ones — the QA layer's single-query
// searches — write after a pause, or at exit.
const FLUSH_NOW_AT = 32
const SAVE_DELAY_MS = 2000

/** The live caches, for the one exit hook. */
const flushers = new Set<() => void>()
process.on("exit", () => {
  for (const flush of flushers) flush()
})

/**
 * `inner` behind the cache at `path`: a text seen before is served from
 * memory (as a copy — callers normalize in place), the rest embedded once
 * and written through to the file.
 */
export function cachedEmbedder(
  inner: Embedder,
  path: string,
  identity: string,
): Embedder {
  const vectors = loadQueryCache(path, identity)
  let dirty = false
  let timer: NodeJS.Timeout | undefined
  const flush = () => {
    if (!dirty) return
    dirty = false
    const onDisk = loadQueryCache(path, identity)
    saveQueryCache(path, identity, new Map([...onDisk, ...vectors]))
  }
  flushers.add(flush)
  return {
    async embed(texts) {
      const misses = [...new Map(texts.map(t => [textKey(t), t]))].filter(
        ([k]) => !vectors.has(k),
      )
      if (misses.length > 0) {
        const fresh = await inner.embed(misses.map(([, t]) => t))
        if (fresh.length !== misses.length) {
          throw new Error(
            `embedder returned ${fresh.length} vectors for ${misses.length} texts`,
          )
        }
        misses.forEach(([k], i) => {
          const v = fresh[i]
          if (v) vectors.set(k, v)
        })
        dirty = true
        clearTimeout(timer)
        if (misses.length >= FLUSH_NOW_AT) flush()
        else timer = setTimeout(flush, SAVE_DELAY_MS).unref()
      }
      return texts.map(t => {
        const v = vectors.get(textKey(t))
        if (!v) throw new Error("embedded text missing from the query cache")
        return v.slice()
      })
    },
  }
}
