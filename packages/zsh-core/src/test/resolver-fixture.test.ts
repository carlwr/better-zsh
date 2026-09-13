import { isDefined } from "@carlwr/typescript-extra"
import { describe, expect, test } from "vitest"
import { buildResolverFixture } from "../../scripts/resolver-fixture"
import { loadCorpus } from "../docs/corpus"
import { resolverFeedbackKinds } from "../docs/resolver"
import { docCategories } from "../docs/taxonomy"

const corpus = loadCorpus()
const meta = { packageVersion: "0.0.0-test", dataHash: "test" }
const fixture = buildResolverFixture(corpus, meta)

describe("resolver conformance fixture", () => {
  test("carries its meta", () => {
    expect(fixture).toMatchObject({ version: 1, ...meta })
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
    expect(new Set(inputs).size).toBe(inputs.length)
    expect(fixture.cases[cat].some(c => c.id === null)).toBe(true)
  })

  test("every feedback kind occurs", () => {
    const seen = new Set(
      docCategories.flatMap(cat =>
        fixture.cases[cat].map(c => c.feedback?.kind).filter(isDefined),
      ),
    )
    expect([...seen].sort()).toEqual([...resolverFeedbackKinds].sort())
  })
})
