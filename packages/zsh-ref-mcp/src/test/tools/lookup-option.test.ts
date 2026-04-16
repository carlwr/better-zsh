import { describe, expect, test } from "vitest"
import { loadCorpus } from "zsh-core"
import { lookupOption } from "../../../index.ts"

const corpus = loadCorpus()

describe("lookupOption", () => {
  test.each([
    { raw: "AUTO_CD", id: "autocd", negated: false },
    { raw: "NO_AUTO_CD", id: "autocd", negated: true },
    { raw: "NOTIFY", id: "notify", negated: false },
    { raw: "NO_NOTIFY", id: "notify", negated: true },
  ])("$raw → $id (negated=$negated)", ({ raw, id, negated }) => {
    const result = lookupOption(corpus, { raw })
    expect(result.match?.id).toBe(id)
    expect(result.match?.negated).toBe(negated)
    expect(result.match?.markdown.length).toBeGreaterThan(0)
  })

  test("non-option returns null", () => {
    expect(lookupOption(corpus, { raw: "echo" }).match).toBeNull()
  })

  test("malformed NO prefix without tail", () => {
    expect(lookupOption(corpus, { raw: "NO_" }).match).toBeNull()
  })
})
