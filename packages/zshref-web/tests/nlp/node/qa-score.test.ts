// The QA scoring on synthetic inputs (each case pins one scoring rule);
// with the staged index and model, a capped slice of the hard
// checks and one synthetic entry through the whole pipeline. The held-out
// corpus is loaded (that is the loader's job) and never printed.

import * as fcu from "@carlwr/fastcheck-utils"
import { docCategories, loadCorpus } from "@carlwr/zsh-core"
import fc from "fast-check"
import { beforeAll, describe, expect, it } from "vitest"
import type { z } from "zod"

import { type RecordId, recordKey, sameRecord } from "../../../nlp/core/types"
import { type EvalAssets, loadEvalAssets } from "../../../nlp/node/eval/assets"
import {
  loadQaCorpus,
  QaCorpusSchema,
  QaEntrySchema,
  qaCorpusJsonSchema,
} from "../../../nlp/node/eval/qa-corpus"
import {
  aggregateScores,
  type EntryScore,
  type HardCheckResult,
  hardCheckCategories,
  hardChecks,
  hardCheckTemplates,
  renderQa,
  scoreEntry,
  scoreHardChecks,
  scoreQaCorpus,
  summaryJson,
} from "../../../nlp/node/eval/qa-score"
import type { JsonSchema } from "../../../nlp/node/rules-schema"
import {
  artifactGate,
  assertCommittedJson,
  PATHS,
  STAGED,
} from "../../_helpers"

const entry = (e: z.input<typeof QaEntrySchema>) => QaEntrySchema.parse(e)
const hit = (category: string, id: string) => ({ category, id })
const exp = (id: string, score: number, category = "option") => ({
  category,
  id,
  score,
})
const q = { query: "q" }
/** A subschema, as opposed to the boolean form or a tuple `items`. */
const isSchema = (s: unknown): s is JsonSchema =>
  typeof s === "object" && s !== null && !Array.isArray(s)

const abc = [hit("option", "a"), hit("option", "b"), hit("option", "c")]

describe("scoreEntry", () => {
  it.each<
    [
      rule: string,
      entry: Omit<z.input<typeof QaEntrySchema>, "query">,
      matches: RecordId[],
      want: Partial<EntryScore>,
    ]
  >([
    [
      "a positive present scores its score",
      { expected: [exp("a", 2)] },
      [hit("option", "a")],
      { score: 2, expectedWeight: 2, matched: 1, warnings: 0 },
    ],
    [
      "a positive absent scores nothing and warns",
      { expected: [exp("a", 2)] },
      [hit("option", "b")],
      { score: 0, expectedWeight: 2, matched: 0, warnings: 1 },
    ],
    [
      "a negative absent earns its magnitude",
      { expected: [exp("a", -3)] },
      [hit("option", "b")],
      { score: 3, expectedWeight: 3, matched: 0, warnings: 0 },
    ],
    [
      "a negative present penalizes and warns",
      { expected: [exp("a", -3)] },
      [hit("option", "a")],
      { score: -3, expectedWeight: 3, matched: 0, warnings: 1 },
    ],
    [
      "a duplicate expected scores once but weighs every time",
      { expected: [exp("a", 1), exp("a", 1)] },
      [hit("option", "a")],
      { score: 1, expectedWeight: 2, matched: 1, warnings: 0 },
    ],
    [
      "identity is category and id",
      { expected: [exp("a", 1, "builtin")] },
      [hit("option", "a")],
      { matched: 0 },
    ],
    [
      "topN below limit narrows the scorable window",
      { limit: 3, topN: 2, expected: [exp("b", 1), exp("c", 1)] },
      abc,
      { score: 1, matched: 1, warnings: 1 },
    ],
    [
      "topN defaults to limit",
      { limit: 2, expected: [exp("c", 1)] },
      abc,
      { score: 0, matched: 0 },
    ],
    [
      "weight scales score and expected weight alike",
      { weight: 0.5, expected: [exp("a", 2), exp("b", -4)] },
      [hit("option", "a")],
      { score: 3, expectedWeight: 3, matched: 1, warnings: 0 },
    ],
  ])("%s", (_, over, matches, want) => {
    expect(scoreEntry(entry({ ...q, ...over }), matches)).toMatchObject(want)
  })

  it("defaults come from the shape", () => {
    expect(entry({ ...q, expected: [exp("a", 1)] })).toMatchObject({
      limit: 20,
      weight: 1,
    })
  })
})

describe("scoreEntry properties", () => {
  const hitModel = {
    category: fcu.element(["option", "builtin"]),
    id: fcu.element(["a", "b", "c"]),
  }
  const arbHit = fcu.record(hitModel)
  // limit, topN and weight may be absent: the schema defaults are in play too
  const arbEntry = fcu
    .record(
      {
        limit: fc.integer({ min: 1, max: 4 }),
        topN: fc.integer({ min: 1, max: 4 }),
        weight: fc.double({ min: 0, max: 3, noNaN: true }),
        expected: fcu.nonEmptyArray(
          fcu.record({
            ...hitModel,
            score: fc.double({ min: -3, max: 3, noNaN: true }),
          }),
          { maxLength: 5 },
        ),
      },
      { requiredKeys: ["expected"] },
    )
    .map(e => entry({ ...q, ...e }))

  it("the score: per negative its magnitude when absent, its score when present; per positive its score once per record when present; a warning per item missed", () => {
    fc.assert(
      fc.property(
        arbEntry,
        fc.array(arbHit, { maxLength: 6 }),
        (e, matches) => {
          const s = scoreEntry(e, matches)
          const window = matches.slice(0, e.topN ?? e.limit)
          const present = (x: RecordId) => window.some(m => sameRecord(m, x))
          const scored = new Set<string>()
          let score = 0
          for (const x of e.expected) {
            if (x.score < 0)
              score += (present(x) ? x.score : -x.score) * e.weight
            else if (present(x) && !scored.has(recordKey(x))) {
              scored.add(recordKey(x))
              score += x.score * e.weight
            }
          }
          expect(s).toEqual<EntryScore>({
            score: expect.closeTo(score, 9),
            expectedWeight: expect.closeTo(
              e.expected.reduce((a, x) => a + Math.abs(x.score) * e.weight, 0),
              9,
            ),
            matched: scored.size,
            warnings: e.expected.filter(x =>
              x.score < 0 ? present(x) : !present(x),
            ).length,
          })
        },
      ),
    )
  })
})

describe("aggregateScores", () => {
  const scored = (
    score: number,
    expectedWeight: number,
    warnings = 0,
  ): EntryScore => ({ score, expectedWeight, matched: 0, warnings })

  it("an empty corpus averages zero", () => {
    expect(aggregateScores([])).toEqual({
      avgScore: 0,
      totalWeightedScore: 0,
      totalExpectedWeight: 0,
      entries: 0,
      warnings: 0,
    })
  })

  it("the average is the ratio of the totals", () => {
    const a = aggregateScores([scored(1, 2, 1), scored(2, 2), scored(-1, 4, 1)])
    expect(a).toEqual({
      avgScore: 0.25,
      totalWeightedScore: 2,
      totalExpectedWeight: 8,
      entries: 3,
      warnings: 2,
    })
  })

  it("sums the entries; the average is 0 without expected weight", () => {
    const arbScored = fcu.record({
      score: fc.double({ min: -5, max: 5, noNaN: true }),
      expectedWeight: fc.double({ min: 0, max: 5, noNaN: true }),
      matched: fc.nat({ max: 3 }),
      warnings: fc.nat({ max: 3 }),
    })
    fc.assert(
      fc.property(fc.array(arbScored, { maxLength: 6 }), scores => {
        const sum = (f: (s: EntryScore) => number) =>
          scores.reduce((a, s) => a + f(s), 0)
        const a = aggregateScores(scores)
        expect(a).toEqual({
          avgScore:
            sum(s => s.expectedWeight) > 0
              ? sum(s => s.score) / sum(s => s.expectedWeight)
              : 0,
          totalWeightedScore: sum(s => s.score),
          totalExpectedWeight: sum(s => s.expectedWeight),
          entries: scores.length,
          warnings: sum(s => s.warnings),
        })
      }),
    )
  })
})

describe("hard-check templates", () => {
  it("render the display form into a question", () => {
    for (const cat of hardCheckCategories()) {
      const template = hardCheckTemplates[cat]
      if (!template) throw new Error(`no template for ${cat}`)
      expect(template("XYZZY")).toMatch(/^what .*\bXYZZY\b/)
    }
  })

  it("name doc categories only", () => {
    const cats = hardCheckCategories()
    expect(cats.length).toBeGreaterThan(0)
    expect(cats.every(c => docCategories.includes(c))).toBe(true)
  })

  it("enumerate every record of a templated category", () => {
    const corpus = loadCorpus()
    const checks = hardChecks(corpus)
    const cats = hardCheckCategories()
    expect(checks.length).toBe(cats.reduce((n, c) => n + corpus[c].size, 0))
    // Table order across categories, corpus order within (the maps are keyed by id).
    expect([...new Set(checks.map(c => c.category))]).toEqual(cats)
    for (const cat of cats) {
      expect(checks.filter(c => c.category === cat).map(c => c.id)).toEqual([
        ...corpus[cat].keys(),
      ])
    }
    expect(checks.every(c => c.query.startsWith("what "))).toBe(true)
  })
})

describe("renderQa", () => {
  const hard: HardCheckResult = {
    perCat: {
      option: { passed: 1, total: 2 },
      builtin: { passed: 3, total: 3 },
    },
    details: [
      '  FAIL: "what does the X option do" → got option/y, expected option/x',
    ],
    passed: 4,
    total: 5,
    hardScore: 75,
  }
  const scored = aggregateScores([
    { score: 1.5, expectedWeight: 2, matched: 1, warnings: 1 },
  ])

  it("prints the hard section, then the summary lines", () => {
    expect(renderQa(hard, scored)).toBe(
      [
        "=== Hard checks (per-category self-retrieval) ===",
        '  FAIL: "what does the X option do" → got option/y, expected option/x',
        "",
        "  100.0%  builtin (3/3)",
        "   50.0%  option (1/2)",
        "",
        "Hard-check score (category-weighted): 75.0%  (4/5 raw)",
        "",
        "Average score: 75.0%  (1.50 / 2.00)",
        "Entries: 1",
        "Warnings: 1",
        "Hard-check score (category-weighted): 75.0%",
        'SUMMARY_JSON {"avgPercent":75,"hardPercent":75}',
        "",
      ].join("\n"),
    )
  })

  it("the summary JSON rounds to one decimal", () => {
    const s = aggregateScores([
      { score: 1, expectedWeight: 3, matched: 1, warnings: 0 },
    ])
    expect(summaryJson({ ...hard, hardScore: 33.333 }, s)).toEqual({
      avgPercent: 33.3,
      hardPercent: 33.3,
    })
  })
})

describe("qa corpus", () => {
  it("the committed corpus loads", async () => {
    const corpus = await loadQaCorpus()
    expect(corpus.entries.length).toBeGreaterThan(0)
  })

  it("rejects an unknown entry key and an empty expected set", () => {
    const ok = { entries: [{ query: "x", expected: [exp("a", 1)] }] }
    expect(QaCorpusSchema.safeParse(ok).success).toBe(true)
    expect(
      QaCorpusSchema.safeParse({ ...ok, $schema: "./nlp-corpus.schema.json" })
        .success,
    ).toBe(true)
    expect(
      QaCorpusSchema.safeParse({ entries: [{ query: "x", expected: [] }] })
        .success,
    ).toBe(false)
    expect(
      QaCorpusSchema.safeParse({
        entries: [{ query: "x", top: 1, expected: [exp("a", 1)] }],
      }).success,
    ).toBe(false)
  })

  it("emits a draft 2020-12 schema with the authored fields", () => {
    const s = qaCorpusJsonSchema()
    expect(s.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    expect(s.title).toBe("NLP QA Corpus")
    expect(s.required).toEqual(["entries"])
    const entries = s.properties?.entries
    const items = isSchema(entries) ? entries.items : undefined
    const entryProps = (isSchema(items) ? items.properties : undefined) ?? {}
    expect(Object.keys(entryProps)).toEqual([
      "query",
      "category",
      "limit",
      "topN",
      "weight",
      "expected",
    ])
    expect(isSchema(entryProps.limit) && entryProps.limit.default).toBe(20)
    expect(isSchema(entryProps.weight) && entryProps.weight.default).toBe(1)
  })

  // The same variable rewrites the rules schemas (`rules.test.ts` beside this).
  it("the schema matches the committed file", async () => {
    await assertCommittedJson(
      PATHS.qaSchema,
      qaCorpusJsonSchema(),
      "UPDATE_SCHEMAS",
    )
  })
})

const skipReason = artifactGate("qa score", [...STAGED.index, ...STAGED.model])

describe("qa scoring over the staged assets", () => {
  let assets: EvalAssets

  beforeAll(async () => {
    if (skipReason) return
    assets = await loadEvalAssets()
  }, 180_000)

  it("hard checks on a capped slice have the result shape", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const [cat] = hardCheckCategories()
    if (!cat) throw new Error("no templated category")
    const checks = hardChecks(assets.corpus)
      .filter(c => c.category === cat)
      .slice(0, 5)
    const r = await scoreHardChecks(checks, assets)
    expect(Object.keys(r.perCat)).toEqual([cat])
    expect(r.perCat[cat]).toEqual({ passed: r.passed, total: 5 })
    expect(r.total).toBe(5)
    expect(r.details.length).toBe(5 - r.passed)
    expect(r.hardScore).toBe((r.passed / 5) * 100)
  }, 60_000)

  it("a synthetic entry runs through the pipeline", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    // A canonical option form: the lookup map promotes it to #1; the
    // negative names no record, so it is absent for sure.
    const corpus = QaCorpusSchema.parse({
      entries: [
        {
          query: "AUTO_CD",
          category: "option",
          limit: 3,
          expected: [exp("autocd", 1), exp("no-such-record", -1)],
        },
      ],
    })
    const s = await scoreQaCorpus(corpus, assets)
    expect(s).toEqual({
      avgScore: 1,
      totalWeightedScore: 2,
      totalExpectedWeight: 2,
      entries: 1,
      warnings: 0,
    })
  }, 60_000)
})
