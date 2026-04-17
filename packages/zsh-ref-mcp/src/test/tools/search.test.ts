import { describe, expect, test } from "vitest"
import { loadCorpus } from "zsh-core"
import { search } from "../../../index.ts"

const corpus = loadCorpus()

describe("search", () => {
  test("exact id wins over prefix and fuzzy", () => {
    const r = search(corpus, { query: "echo", category: "builtin", limit: 5 })
    expect(r.matches[0]?.id).toBe("echo")
    expect(r.matches[0]?.score).toBeUndefined()
  })

  test("prefix match returns with no score", () => {
    const r = search(corpus, { query: "auto", category: "option", limit: 5 })
    expect(r.matches.length).toBeGreaterThan(0)
    expect(r.matches[0]?.id.startsWith("auto")).toBe(true)
    for (const m of r.matches) expect(m.score).toBeUndefined()
  })

  test("category filter narrows results", () => {
    const r = search(corpus, { query: "", category: "precmd", limit: 100 })
    for (const m of r.matches) expect(m.category).toBe("precmd")
    expect(r.matches.length).toBeGreaterThan(0)
  })

  test("empty query lists records", () => {
    const r = search(corpus, { limit: 7 })
    expect(r.matches.length).toBe(7)
    for (const m of r.matches) {
      expect(m.id.length).toBeGreaterThan(0)
      expect(m.display.length).toBeGreaterThan(0)
    }
  })

  test("limit is clamped to MAX_LIMIT=100", () => {
    const r = search(corpus, { limit: 10_000 })
    expect(r.matches.length).toBeLessThanOrEqual(100)
  })

  test("default limit is 20 when unspecified", () => {
    const r = search(corpus, {})
    expect(r.matches.length).toBeLessThanOrEqual(20)
  })

  test("fuzzy match surfaces score", () => {
    // non-prefix, non-exact typo-style query should hit the fuzzy branch
    const r = search(corpus, { query: "atcd", category: "option", limit: 3 })
    const hit = r.matches.find(m => m.id === "autocd")
    expect(hit).toBeDefined()
    expect(typeof hit?.score).toBe("number")
  })

  test("no match returns empty", () => {
    const r = search(corpus, { query: "zzzz_definitely_not_a_zsh_thing_qq" })
    expect(r.matches).toEqual([])
  })

  test("results omit markdown body (size containment)", () => {
    const r = search(corpus, { query: "echo" })
    for (const m of r.matches) {
      expect(m).not.toHaveProperty("markdown")
    }
  })
})
