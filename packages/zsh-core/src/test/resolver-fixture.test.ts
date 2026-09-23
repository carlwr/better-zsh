import { allUnique } from "@carlwr/typescript-extra"
import { describe, expect, test } from "vitest"
import { buildResolverFixture } from "../../scripts/resolver-fixture"
import { loadCorpus } from "../docs/corpus"
import { classifyOrder, docCategories } from "../docs/taxonomy"

const corpus = loadCorpus()
const meta = { packageVersion: "0.0.0-test", dataHash: "test" }
const fixture = buildResolverFixture(corpus, meta)

describe("resolver conformance fixture", () => {
  test("carries its meta", () => {
    expect(fixture).toMatchObject({ version: 2, ...meta })
  })

  test("is deterministic", () => {
    expect(buildResolverFixture(corpus, meta)).toEqual(fixture)
  })

  test.each(docCategories)("%s: every id round-trips loss-free", cat => {
    const byInput = new Map(fixture.cases[cat].map(c => [c.input, c]))
    for (const id of corpus[cat].keys()) {
      expect(byInput.get(id)).toEqual({ input: id, id, feedback: null })
    }
  })

  test.each(docCategories)("%s: inputs are unique and a miss occurs", cat => {
    const inputs = fixture.cases[cat].map(c => c.input)
    expect(allUnique(inputs)).toBe(true)
    expect(fixture.cases[cat].some(c => c.id === null)).toBe(true)
  })

  test("walk: inputs are unique; every id is walked; a miss occurs", () => {
    const inputs = fixture.walk.map(c => c.input)
    expect(allUnique(inputs)).toBe(true)
    const walked = new Set(inputs)
    for (const cat of docCategories) {
      for (const id of corpus[cat].keys()) expect(walked.has(id)).toBe(true)
    }
    expect(fixture.walk.some(c => c.hits.length === 0)).toBe(true)
  })

  test("walk: hits follow classifyOrder, one per category", () => {
    const rank = new Map(classifyOrder.map((cat, i) => [cat, i]))
    for (const c of fixture.walk) {
      const ranks = c.hits.map(h => rank.get(h.category) ?? -1)
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
      expect(allUnique(ranks)).toBe(true)
    }
  })

  test("walk: admission differs from the scoped answer somewhere", () => {
    // A history modifier resolves scoped but is declined by the walk.
    const scoped = new Map(fixture.cases.history_expn.map(c => [c.input, c]))
    const declined = fixture.walk.filter(c => {
      const sc = scoped.get(c.input)
      return (
        sc !== undefined &&
        sc.id !== null &&
        !c.hits.some(h => h.category === "history_expn")
      )
    })
    expect(declined.length).toBeGreaterThan(0)
  })
})
