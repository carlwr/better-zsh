// Model-free: a synthetic index, and `buildIndex` over the corpus with
// synthetic vectors; the `built index` tests read the staged one (skipped
// until `build:index` has run).

import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as fcu from "@carlwr/fastcheck-utils"
import { escapeRegExp, memoized } from "@carlwr/typescript-extra"
import { rm_rf } from "@carlwr/typescript-extra/node"
import { loadCorpus } from "@carlwr/zsh-core"
import fc from "fast-check"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Rules } from "../../../nlp/core/rules"
import { INDEX_VERSION, loadSearchIndex } from "../../../nlp/core/search-index"
import {
  DIMS,
  type IndexedRecord,
  MODEL_ID,
  perView,
  type VectorIndex,
  VIEWS,
} from "../../../nlp/core/types"
import { syntheticVec } from "../../../nlp/core/vec"
import {
  buildIndex,
  type IndexPaths,
  type IndexValidation,
  indexJson,
  indexVectors,
  PROGRESS_CHUNK,
  readIndex,
  validateIndex,
  writeIndex,
} from "../../../nlp/node/index-build"
import { corpusFingerprint } from "../../../nlp/node/rendered-corpus"
import { corpusTexts } from "../../../nlp/node/retrieval-text"
import { loadRulesYaml } from "../../../nlp/node/rules-load"
import { arbViewVectors } from "../../_arbs"
import { makeRecordText } from "../../_fixtures"
import { artifactGate, loadIndexFromDisk, STAGED } from "../../_helpers"

const corpus = loadCorpus()
let rules: Rules
beforeAll(async () => {
  rules = await loadRulesYaml()
})

const rejected = (v: IndexValidation, reason: RegExp): void => {
  expect(v.ok).toBe(false)
  if (!v.ok) expect(v.reason).toMatch(reason)
}

const tinyIndex = (): VectorIndex => {
  const text = (id: string, subKind?: string) => ({
    category: "option",
    category_label: "option",
    id,
    display: id.toUpperCase(),
    ...(subKind === undefined ? {} : { sub_kind: subKind }),
    title: `\`${id}\``,
    md_body: "body",
    structured: `id: ${id}`,
    body: `${id} does things`,
    expanded: "option",
  })
  const vectors = (seed: number) => ({
    structured: new Float32Array([seed, 0.5, -0.25]),
    body: new Float32Array([Math.fround(0.1), seed, 1e-7]),
    expanded: new Float32Array([0, 0.75, Math.fround(seed * 0.3)]),
  })
  return {
    version: INDEX_VERSION,
    model: MODEL_ID,
    dims: 3,
    normalized: true,
    corpus_hash: "ab".repeat(32),
    records: [
      { text: text("autocd"), vectors: vectors(1) },
      { text: text("globdots", "x"), vectors: vectors(2) },
    ],
  }
}

describe("writeIndex / readIndex", () => {
  let dir: string
  let at = 0
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "index-build-"))
  })
  afterAll(() => rm_rf(dir))

  /** A fresh, nested pair of paths — the writer creates the parents. */
  const paths = (): IndexPaths => {
    const base = join(dir, `nested-${at++}`, "search-index")
    return { json: `${base}.json`, vectors: `${base}.bin` }
  }

  it("writes a JSON half that is compact, header first, and text only", () => {
    const json = indexJson(tinyIndex())
    expect(json).not.toContain("\n")
    expect(
      json.startsWith(
        `{"version":${INDEX_VERSION},"model":"${MODEL_ID}","dims":3,"normalized":true,"corpus_hash":"`,
      ),
    ).toBe(true)
    expect(json).toContain('"records":[{"category":"option",')
    expect(json).not.toContain("vectors")
  })

  it("round-trips through the production loader", async () => {
    const index = tinyIndex()
    const path = paths()
    await writeIndex(path, index)
    expect(await readIndex(path)).toEqual(index)
  })

  /** `tinyIndex` at another width, so its own blob stays self-consistent. */
  const wideIndex = (dims: number): VectorIndex => ({
    ...tinyIndex(),
    dims,
    records: tinyIndex().records.map(r => ({
      ...r,
      vectors: perView(() => new Float32Array(dims)),
    })),
  })

  // Halves of different builds: the one failure the split introduced.
  it.each([
    [
      "another corpus",
      () => ({ ...tinyIndex(), corpus_hash: "cd".repeat(32) }),
      /vectors of corpus/,
    ],
    ["another vector width", () => wideIndex(4), /-dim vectors/],
    [
      "another record count",
      () => ({ ...tinyIndex(), records: tinyIndex().records.slice(1) }),
      /vector records/,
    ],
  ])("rejects a vector half built from %s", (_label, other, reason) => {
    expect(() =>
      loadSearchIndex(
        JSON.parse(indexJson(tinyIndex())),
        indexVectors(other()),
      ),
    ).toThrow(reason)
  })

  // Any index shape: the declared dims and the vector widths agree (a
  // fixed-stride format admits nothing else), record text with a `sub_kind`
  // or without, any header strings.
  const arbIndex: fc.Arbitrary<VectorIndex> = fc
    .integer({ min: 0, max: 4 })
    .chain(dims =>
      fcu.record({
        version: fc.constant(INDEX_VERSION),
        model: fc.string(),
        dims: fc.constant(dims),
        normalized: fc.boolean(),
        corpus_hash: fc.string(),
        records: fc.array(
          fcu.record({
            text: fcu
              .record(
                {
                  id: fc.string(),
                  body: fc.string(),
                  sub_kind: fc.string({ minLength: 1 }),
                },
                { requiredKeys: ["id", "body"] },
              )
              .map(makeRecordText),
            vectors: arbViewVectors(dims),
          }),
          { maxLength: 3 },
        ),
      }),
    )

  it("both halves read back equal through the production loader, for any index", () => {
    fc.assert(
      fc.property(arbIndex, index => {
        const json = indexJson(index)
        expect(json).not.toContain("\n")
        expect(loadSearchIndex(JSON.parse(json), indexVectors(index))).toEqual(
          index,
        )
      }),
    )
  })
})

describe("validateIndex", () => {
  // A structurally valid index of this corpus without the model: the vectors
  // are zero (no unit-length check, by design — the flag is trusted).
  const zeroIndex = (): VectorIndex => ({
    version: INDEX_VERSION,
    model: MODEL_ID,
    dims: DIMS,
    normalized: true,
    corpus_hash: corpusFingerprint(corpus),
    records: corpusTexts(corpus, rules.synonyms.index_groups).map(text => ({
      text,
      vectors: perView(() => new Float32Array(DIMS)),
    })),
  })

  it("accepts a zero-vector index of this corpus", () => {
    expect(validateIndex(zeroIndex(), corpus, rules)).toEqual({ ok: true })
  })

  it("checks header before records", () => {
    const base = zeroIndex()
    const first = base.records[0]
    if (!first) throw new Error("empty corpus")
    const tamperedText: IndexedRecord = {
      ...first,
      text: { ...first.text, body: `${first.text.body} x` },
    }
    const cases: [string, Partial<VectorIndex>, RegExp][] = [
      [
        "version",
        { version: 1, model: "other" },
        /unsupported nlp index version 1/,
      ],
      ["model", { model: "other", dims: 1 }, /model is other, expected/],
      ["dims", { dims: 1, corpus_hash: "x" }, /dims is 1, expected/],
      [
        "corpus hash",
        { corpus_hash: "x", normalized: false },
        /corpus hash does not match/,
      ],
      [
        "normalized",
        { normalized: false, records: [] },
        /not marked normalized/,
      ],
      [
        "record count",
        { records: base.records.slice(1) },
        /has \d+ records, expected \d+/,
      ],
      [
        "record text",
        { records: [tamperedText, ...base.records.slice(1)] },
        new RegExp(
          `record 0 is ${escapeRegExp(`${first.text.category}/${first.text.id}, expected ${first.text.category}/`)}`,
        ),
      ],
    ]
    for (const [label, patch, reason] of cases) {
      const v = validateIndex({ ...base, ...patch }, corpus, rules)
      expect(v.ok, label).toBe(false)
      if (!v.ok) expect(v.reason, label).toMatch(reason)
    }
  })

  // The rules are an input of the expected text: a synonym group the index
  // was not built with changes some record's expanded view.
  it("rejects an index built under other synonym groups", () => {
    const group = ["autocd", "a synonym no record mentions"]
    const other: Rules = {
      ...rules,
      synonyms: { ...rules.synonyms, index_groups: [group] },
    }
    rejected(
      validateIndex(zeroIndex(), corpus, other),
      /nlp index record \d+ is /,
    )
  })
})

// The model swapped for `syntheticVec`. What nothing else pins is the
// view ↔ vector alignment: a wrong interleave still validates, and a real
// build would show it only as ranking quality.
describe("buildIndex", () => {
  it("each view slot holds the vector embedded for its own passage text, unit length; progress paced by chunk", async () => {
    const embedded = new Map<string, Float32Array>()
    const progress: [number, number][] = []
    const index = await buildIndex({
      corpus,
      rules,
      embedder: {
        embed: async texts =>
          texts.map(t => {
            const v = syntheticVec([t])
            embedded.set(t, v)
            return v
          }),
      },
      onProgress: (done, total) => progress.push([done, total]),
    })
    expect(validateIndex(index, corpus, rules)).toEqual({ ok: true })
    expect(index.corpus_hash).toBe(corpusFingerprint(corpus))
    // By value: view texts repeat across records, so the map holds one array per text.
    const misaligned: string[] = []
    let worst = 0
    for (const rec of index.records) {
      for (const view of VIEWS) {
        const v = rec.vectors[view]
        const want = embedded.get(`passage: ${rec.text[view]}`)
        if (!want || v.some((x, k) => x !== want[k]))
          misaligned.push(`${rec.text.category}/${rec.text.id}.${view}`)
        worst = Math.max(worst, Math.abs(Math.hypot(...v) - 1))
      }
    }
    expect(misaligned).toEqual([])
    expect(worst).toBeLessThanOrEqual(1e-6)
    const total = index.records.length * VIEWS.length
    expect(progress).toHaveLength(Math.ceil(total / PROGRESS_CHUNK))
    expect(progress.at(-1)).toEqual([total, total])
  })
})

const skipReason = artifactGate("built index", [...STAGED.index])
// Read once, shared by the tests below; none mutates it (the vectors are
// views over one buffer).
const staged = memoized(loadIndexFromDisk)

describe("built index", () => {
  it("validates the staged index and rejects it tampered", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const index = await staged()
    expect(validateIndex(index, corpus, rules)).toEqual({ ok: true })

    rejected(
      validateIndex({ ...index, corpus_hash: "0".repeat(64) }, corpus, rules),
      /corpus hash/,
    )
    rejected(
      validateIndex(
        { ...index, records: index.records.slice(0, -1) },
        corpus,
        rules,
      ),
      /records, expected/,
    )

    const [first, ...rest] = index.records
    if (!first) throw new Error("empty index")
    const truncated: IndexedRecord = {
      ...first,
      vectors: { ...first.vectors, body: first.vectors.body.slice(0, 1) },
    }
    rejected(
      validateIndex({ ...index, records: [truncated, ...rest] }, corpus, rules),
      /view body has 1 dims/,
    )
  })

  it("every vector is unit length with the declared dims", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const index = await staged()
    let worst = 0
    for (const rec of index.records) {
      for (const view of VIEWS) {
        const v = rec.vectors[view]
        expect(v.length).toBe(index.dims)
        worst = Math.max(worst, Math.abs(Math.hypot(...v) - 1))
      }
    }
    expect(worst).toBeLessThanOrEqual(1e-6)
  })
})
