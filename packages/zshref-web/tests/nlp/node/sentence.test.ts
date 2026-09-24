// The curated sentence eval. The committed fixture is loaded blind (counts
// and record existence only — nothing of an entry is printed); with the
// staged index and model, the report, aggregates only. The eval chain
// itself runs over the parity fixture's miniature index, so it needs no
// model.

import * as fcu from "@carlwr/fastcheck-utils"
import { loadCorpus } from "@carlwr/zsh-core"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { parse as parseYaml } from "yaml"
import { syntheticVec } from "../../../nlp/core/vec"
import { loadEvalAssets } from "../../../nlp/node/eval/assets"
import {
  BETA,
  gain,
  type Split,
  score,
  scoreSplit,
  type Vote,
} from "../../../nlp/node/eval/metric"
import {
  evalSentence,
  evalSentenceCached,
  renderSentence,
} from "../../../nlp/node/eval/sentence"
import {
  DEFAULT_TARGET_DEPTH,
  DEFAULT_WEIGHT,
  loadSentenceFixture,
  parseSentenceFixture,
  SENTENCE_FIXTURE_VERSION,
  SentenceFixtureSchema,
} from "../../../nlp/node/eval/sentence-fixture"
import { loadRulesYaml } from "../../../nlp/node/rules-load"
import {
  rulesJsonSchemas,
  SENTENCE_FIXTURE_SCHEMA_FILE,
} from "../../../nlp/node/rules-schema"
import { arbSplit } from "../../_arbs"
import {
  artifactGate,
  inCorpus,
  parityRankAssets,
  STAGED,
} from "../../_helpers"

const corpus = loadCorpus()

const vote = (
  category: string,
  weight: number,
  gain: number,
  split: Split,
): Vote => ({
  category,
  weight,
  gain,
  split,
})

const versioned = (body: string): string =>
  `version: ${SENTENCE_FIXTURE_VERSION}\n${body}`

describe("committed sentence fixture", () => {
  it("loads and validates", async () => {
    const f = await loadSentenceFixture()
    expect(f.entries.length).toBeGreaterThan(0)
    for (const e of f.entries) expect(e.query.trim()).not.toBe("")
  })

  /** Every expected item names a corpus record. Pure on the corpus. A
   * missing holdout item is reported by position only. */
  it("every expected record exists", async () => {
    const f = await loadSentenceFixture()
    const missing = f.entries.flatMap((e, i) =>
      e.want.flatMap((item, j) => {
        if (inCorpus(corpus, item)) return []
        const at = `entry ${i} item ${j}`
        return [
          e.split === "train"
            ? `${at}: ${item.category}/${item.id} — no such record`
            : `${at} (holdout)`,
        ]
      }),
    )
    expect(missing).toEqual([])
  })

  it("emits the editor schema with the rule schemas", () => {
    const s = rulesJsonSchemas()[SENTENCE_FIXTURE_SCHEMA_FILE]
    expect(s.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    expect(s.title).toBe("SentenceFixture")
    expect(s.additionalProperties).toBe(false)
    expect(s.required).toEqual(["version", "entries"])
  })
})

describe("sentence eval report", () => {
  const skipReason = artifactGate("sentence eval report", [
    ...STAGED.index,
    ...STAGED.model,
  ])

  it("the report", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const assets = await loadEvalAssets()
    const r = await evalSentence(await loadSentenceFixture(), assets)
    console.log(renderSentence(r).trimEnd())
    expect(Number.isFinite(r.all.total)).toBe(true)
    expect(r.all.total).toBeGreaterThanOrEqual(0)
    expect(r.all.total).toBeLessThanOrEqual(1)
  }, 180_000)
})

describe("score", () => {
  it("is per-category normalized", () => {
    // A: 10 votes, all hit; B: 1 vote, a miss. Total (1 + 0) / 2, whatever
    // the per-category vote counts.
    const votes = Array.from({ length: 10 }, () => vote("A", 1, 1, "train"))
    votes.push(vote("B", 1, 0, "train"))
    const s = score(votes)
    expect(s.total).toBeCloseTo(0.5, 6)
    expect(s.perCategory.get("A")).toBeCloseTo(1, 6)
    expect(s.perCategory.get("B")).toBeCloseTo(0, 6)
  })

  it("respects vote weights", () => {
    // One category: a hit at weight 3, a miss at weight 1 → 3/4.
    const s = score([vote("X", 3, 1, "train"), vote("X", 1, 0, "train")])
    expect(s.total).toBeCloseTo(0.75, 6)
  })

  it("scoreSplit partitions by split", () => {
    const votes = [vote("X", 1, 0, "train"), vote("X", 1, 1, "holdout")]
    expect(scoreSplit(votes, "train").total).toBeCloseTo(0, 6)
    expect(scoreSplit(votes, "holdout").total).toBeCloseTo(1, 6)
  })

  it("scores nothing as zero, categories in byte order", () => {
    expect(score([])).toEqual({ perCategory: new Map(), total: 0 })
    const s = score([
      vote("b", 1, 1, "train"),
      vote("B", 1, 0, "train"),
      vote("a", 1, 1, "train"),
    ])
    expect([...s.perCategory.keys()]).toEqual(["B", "a", "b"])
  })
})

describe("gain", () => {
  it("is normalized and monotone", () => {
    // gain(1) == 1 whatever the target depth.
    for (const d of [1, 3, 5]) expect(gain(1, d, BETA)).toBeCloseTo(1, 6)
    // Decreasing in the rank, staying positive (polynomial tail).
    expect(gain(100, 1, 2)).toBeGreaterThan(gain(1000, 1, 2))
    expect(gain(1000, 1, 2)).toBeGreaterThan(0)
    // At rank == d: (1 + (1/d)^β) / 2.
    for (const d of [2, 4])
      expect(gain(d, d, BETA)).toBeCloseTo((1 + (1 / d) ** BETA) / 2, 6)
  })

  // Depths on a half-unit grid: two distinct ones differ by enough to order the gains.
  const arbDepth = fc.integer({ min: 1, max: 100 }).map(i => i / 2)
  const arbRank = fc.integer({ min: 1, max: 5000 })

  it("is 1 at rank 1, in (0, 1], strictly decreasing in the rank, and increasing in the depth", () => {
    fc.assert(
      fc.property(arbRank, arbDepth, arbDepth, (rank, d, d2) => {
        expect(gain(1, d, BETA)).toBeCloseTo(1, 12)
        const g = gain(rank, d, BETA)
        expect(g).toBeGreaterThan(0)
        expect(g).toBeLessThanOrEqual(1 + 1e-12)
        expect(gain(rank + 1, d, BETA)).toBeLessThan(g)
        if (rank > 1 && d2 > d) expect(gain(rank, d2, BETA)).toBeGreaterThan(g)
      }),
    )
  })
})

describe("score properties", () => {
  const arbVote: fc.Arbitrary<Vote> = fcu.record({
    category: fcu.element(["a", "b", "c"]),
    weight: fc.double({ min: 0.1, max: 5, noNaN: true }),
    gain: fc.double({ min: 0, max: 1, noNaN: true }),
    split: arbSplit,
  })

  it("every score is in [0, 1]; per category the weighted mean, sorted; the total their plain mean", () => {
    fc.assert(
      fc.property(fc.array(arbVote, { maxLength: 12 }), votes => {
        const s = score(votes)
        const cats = [...new Set(votes.map(v => v.category))].sort()
        expect([...s.perCategory.keys()]).toEqual(cats)
        for (const c of cats) {
          const mine = votes.filter(v => v.category === c)
          const w = mine.reduce((a, v) => a + v.weight, 0)
          const g = mine.reduce((a, v) => a + v.weight * v.gain, 0)
          expect(s.perCategory.get(c)).toBeCloseTo(g / w, 9)
        }
        const means = [...s.perCategory.values()]
        expect(s.total).toBeCloseTo(
          means.length ? means.reduce((a, b) => a + b, 0) / means.length : 0,
          9,
        )
        expect(s.total).toBeGreaterThanOrEqual(0)
        expect(s.total).toBeLessThanOrEqual(1 + 1e-12)
      }),
    )
  })
})

describe("fixture shape", () => {
  const arbNum = fc.double({ min: 0.5, max: 8, noNaN: true })
  // Optional keys absent, never `undefined`: as YAML leaves them.
  const arbRaw = fcu.record(
    {
      version: fc.constant(SENTENCE_FIXTURE_VERSION),
      "default-weight": arbNum,
      "default-target-depth": arbNum,
      entries: fc.array(
        fcu.record(
          {
            query: fcu.element(["a", "b"]),
            want: fcu.nonEmptyArray(
              fcu.record(
                {
                  cat: fcu.element(["c", "d"]),
                  id: fcu.element(["x", "y"]),
                  d: arbNum,
                  w: arbNum,
                },
                { requiredKeys: ["cat", "id"] },
              ),
              { maxLength: 3 },
            ),
            holdout: fc.boolean(),
          },
          { requiredKeys: ["query", "want"] },
        ),
        { maxLength: 3 },
      ),
    },
    { requiredKeys: ["version", "entries"] },
  )

  it("resolves an item's depth and weight: its own, else the fixture's default, else the built-in; the split from the flag", () => {
    fc.assert(
      fc.property(arbRaw, raw => {
        const f = SentenceFixtureSchema.parse(raw)
        const weight = raw["default-weight"] ?? DEFAULT_WEIGHT
        const depth = raw["default-target-depth"] ?? DEFAULT_TARGET_DEPTH
        expect(f).toEqual({
          defaultWeight: weight,
          defaultTargetDepth: depth,
          entries: raw.entries.map(e => ({
            query: e.query,
            split: e.holdout ? "holdout" : "train",
            want: e.want.map(i => ({
              category: i.cat,
              id: i.id,
              targetDepth: i.d ?? depth,
              weight: i.w ?? weight,
            })),
          })),
        })
      }),
    )
  })

  it("rejects a stale version, an empty want-set, a non-positive value, an unknown key", () => {
    const paths = (yaml: string): string[] => {
      const r = SentenceFixtureSchema.safeParse(parseYaml(yaml))
      if (r.success) throw new Error("expected a rejection")
      return r.error.issues.map(i => i.path.join("."))
    }
    const entry = "entries:\n  - query: a\n    want: [{cat: c, id: i}]\n"
    expect(paths(`version: ${SENTENCE_FIXTURE_VERSION - 1}\n${entry}`)).toEqual(
      ["version"],
    )
    expect(paths(versioned("entries:\n  - query: a\n    want: []\n"))).toEqual([
      "entries.0.want",
    ])
    expect(
      paths(
        versioned(
          "entries:\n  - query: a\n    want: [{cat: c, id: i, d: 0}]\n",
        ),
      ),
    ).toEqual(["entries.0.want.0.d"])
    expect(paths(versioned(`default-weight: -1\n${entry}`))).toEqual([
      "default-weight",
      "entries.0.want.0.w",
    ])
    expect(paths(versioned(`${entry}    extra: 1\n`))).toEqual(["entries.0"])
  })
})

describe("eval over the parity index", () => {
  it("a multi-item entry yields one vote per item", async () => {
    const assets = parityRankAssets(corpus, await loadRulesYaml())
    const { index } = assets
    // Three items in one category at a depth far past the index's few
    // records, so each gains 1 to within rounding whatever its rank; a
    // fourth the index lacks counts as ranked just past the end.
    const query = "alpha"
    const fixture = parseSentenceFixture(
      versioned(
        `default-target-depth: 1000000\nentries:\n  - query: ${query}\n    want:\n      - {cat: option, id: autocd}\n      - {cat: option, id: extendedglob}\n      - {cat: option, id: globdots}\n      - {cat: builtin, id: echo, d: 3}\n`,
      ),
    )
    const vecs = new Map([[query, syntheticVec(["query", query])]])
    const r = evalSentenceCached(fixture.entries, vecs, assets)
    expect(r.nEntries).toBe(1)
    expect(r.perCategoryN.get("option")).toBe(3)
    expect(r.perCategoryN.get("builtin")).toBe(1)
    expect(r.all.perCategory.get("option")).toBeCloseTo(1, 9)
    const missingGain = gain(index.records.length + 1, 3)
    expect(r.all.perCategory.get("builtin")).toBe(missingGain)
    expect(r.all.total).toBeCloseTo((1 + missingGain) / 2, 6)
    expect(r.train.total).toBe(r.all.total)
    expect(r.holdout.total).toBe(0)
    expect(renderSentence(r)).toBe(
      `[sentence-fixture] total=${r.all.total.toFixed(3)}  train=${r.all.total.toFixed(3)}  holdout=0.000 (overfit-watch — never tune on this)  (1 entries)\n` +
        `  builtin              ${missingGain.toFixed(3)}  (n=1)\n` +
        "  option               1.000  (n=3)\n",
    )
  })
})
