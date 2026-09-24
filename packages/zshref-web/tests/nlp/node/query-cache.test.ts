// The query cache over a counting fake embedder and a temp dir: what is
// served from memory, what reaches the disk, and what drops the file. The
// identity over a fake model dir; the real one needs the model (skipped
// without it).

import { readFileSync } from "node:fs"
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as fcu from "@carlwr/fastcheck-utils"
import { rm_rf } from "@carlwr/typescript-extra/node"
import fc from "fast-check"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { DIMS } from "../../../nlp/core/types"
import { syntheticVec } from "../../../nlp/core/vec"
import {
  type Embedder,
  embedderIdentity,
} from "../../../nlp/node/embedder-node"
import {
  cachedEmbedder,
  loadQueryCache,
  saveQueryCache,
  textKey,
} from "../../../nlp/node/query-cache"
import { artifactGate, STAGED } from "../../_helpers"

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "query-cache-"))
})
afterAll(() => rm_rf(dir))

/** Synthetic vectors, counting the texts it is asked for. */
function counting(): Embedder & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    embed: async texts => {
      asked.push(...texts)
      return texts.map(t => syntheticVec([t]))
    },
  }
}

describe("cachedEmbedder", () => {
  it("serves every batch in order; asks the inner embedder each distinct text once, first-seen order", async () => {
    let run = 0
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.array(fcu.element(["a", "b", "c", "d"]), { maxLength: 5 }),
          { maxLength: 4 },
        ),
        async batches => {
          const inner = counting()
          const e = cachedEmbedder(inner, join(dir, `q${run++}.json`), "id")
          for (const b of batches)
            expect(await e.embed(b)).toEqual(b.map(t => syntheticVec([t])))
          expect(inner.asked).toEqual([...new Set(batches.flat())])
        },
      ),
      { numRuns: 30 },
    )
  })

  it("serves copies: what a caller does to its vector stays out of the cache", async () => {
    const e = cachedEmbedder(counting(), join(dir, "none.json"), "id")
    const [v] = await e.embed(["a"])
    v?.fill(0)
    expect((await e.embed(["a"]))[0]).toEqual(syntheticVec(["a"]))
  })
})

describe("the file", () => {
  it("round-trips under its identity, and is dropped under another or when unreadable", async () => {
    const path = join(dir, "cache.json")
    const vectors = new Map([
      [textKey("query: x"), syntheticVec(["x"])],
      [textKey("query: y"), syntheticVec(["y"])],
    ])
    saveQueryCache(path, "id", vectors)
    expect(loadQueryCache(path, "id")).toEqual(vectors)
    // No query text on disk: the held-out sets pass through here (NLP.md).
    expect(readFileSync(path, "utf8")).not.toContain("query")
    expect(loadQueryCache(path, "other").size).toBe(0)
    expect(loadQueryCache(join(dir, "missing.json"), "id").size).toBe(0)

    const inner = counting()
    const served = await cachedEmbedder(inner, path, "id").embed(["query: y"])
    expect(inner.asked).toEqual([])
    expect(served[0]).toEqual(syntheticVec(["y"]))

    await writeFile(path, "{not json")
    expect(loadQueryCache(path, "id").size).toBe(0)
  })

  it("round-trips any vectors under any identity, and no other", () => {
    const arbVec = fc
      .float32Array({
        minLength: DIMS,
        maxLength: DIMS,
        noNaN: true,
        noDefaultInfinity: true,
      })
      .map(v => v.map(x => (x === 0 ? 0 : x))) // `-0` prints as `0`
    const arbVectors = fc
      .uniqueArray(fc.tuple(fc.string(), arbVec), {
        maxLength: 3,
        selector: ([k]) => k,
      })
      .map(kvs => new Map(kvs.map(([k, v]) => [textKey(k), v])))
    fc.assert(
      fc.property(
        arbVectors,
        fc.string(),
        fc.string(),
        (vectors, id, other) => {
          const path = join(dir, "any.json")
          saveQueryCache(path, id, vectors)
          expect(loadQueryCache(path, id)).toEqual(vectors)
          expect(loadQueryCache(path, other).size).toBe(
            other === id ? vectors.size : 0,
          )
        },
      ),
      { numRuns: 30 },
    )
  })

  it("is written after a pause for a small batch, at once for a large one, merged", async () => {
    vi.useFakeTimers()
    try {
      const path = join(dir, "shared.json")
      const a = cachedEmbedder(counting(), path, "id")
      const b = cachedEmbedder(counting(), path, "id")
      await a.embed(["a"])
      expect(loadQueryCache(path, "id").size).toBe(0)
      const many = Array.from({ length: 40 }, (_, i) => `q${i}`)
      await b.embed(many)
      expect(loadQueryCache(path, "id").size).toBe(many.length)
      vi.runAllTimers()
      expect(loadQueryCache(path, "id").size).toBe(many.length + 1)
      expect(loadQueryCache(path, "id").has(textKey("a"))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("embedderIdentity", () => {
  it("moves with a model file's content or timestamp; not with the dir's path", async () => {
    const a = join(dir, "model-a")
    const b = join(dir, "model-b")
    const t0 = 1_700_000_000
    for (const d of [a, b]) {
      await mkdir(join(d, "onnx"), { recursive: true })
      for (const [f, text] of [
        ["config.json", "{}"],
        ["onnx/model.onnx", "weights"],
      ] as const) {
        await writeFile(join(d, f), text)
        await utimes(join(d, f), t0, t0)
      }
    }
    const id = embedderIdentity(a)
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(embedderIdentity(b)).toBe(id)

    await writeFile(join(b, "onnx", "model.onnx"), "weights!")
    await utimes(join(b, "onnx", "model.onnx"), t0, t0)
    expect(embedderIdentity(b)).not.toBe(id)

    await utimes(join(a, "config.json"), t0 + 1, t0 + 1)
    expect(embedderIdentity(a)).not.toBe(id)
  })

  const skipReason = artifactGate("embedder identity", [...STAGED.model])
  it("is stable over the staged model", ctx => {
    if (skipReason) ctx.skip(skipReason)
    expect(embedderIdentity()).toBe(embedderIdentity())
  })
})
