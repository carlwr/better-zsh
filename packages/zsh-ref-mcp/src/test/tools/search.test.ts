import { describe, expect, test } from "vitest"
import { docCategories, loadCorpus } from "zsh-core"
import { DEFAULT_LIMIT, MAX_LIMIT, search } from "../../../index.ts"

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

  test("limit is clamped to MAX_LIMIT", () => {
    const r = search(corpus, { limit: 10_000 })
    expect(r.matches.length).toBeLessThanOrEqual(MAX_LIMIT)
  })

  test("default limit is DEFAULT_LIMIT when unspecified", () => {
    const r = search(corpus, {})
    expect(r.matches.length).toBeLessThanOrEqual(DEFAULT_LIMIT)
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

  test("matchesReturned equals matches.length", () => {
    const r1 = search(corpus, { query: "auto", category: "option", limit: 3 })
    expect(r1.matchesReturned).toBe(r1.matches.length)
    const r2 = search(corpus, { category: "option", limit: MAX_LIMIT })
    expect(r2.matchesReturned).toBe(r2.matches.length)
    const r3 = search(corpus, { query: "zzzz_definitely_not_a_zsh_thing_qq" })
    expect(r3.matchesReturned).toBe(0)
    expect(r3.matchesTotal).toBe(0)
  })

  test("matchesTotal counts pre-truncation matches (list-all branch)", () => {
    const full = search(corpus, { category: "option", limit: MAX_LIMIT })
    expect(full.matchesTotal).toBe(full.matchesReturned)
    const capped = search(corpus, { category: "option", limit: 3 })
    expect(capped.matchesReturned).toBe(3)
    expect(capped.matchesTotal).toBe(full.matchesTotal)
  })

  test("matchesTotal counts pre-truncation matches (fuzzy branch)", () => {
    // broad query to force a fuzzy pool larger than a tiny limit
    const full = search(corpus, { query: "a", limit: MAX_LIMIT })
    const capped = search(corpus, { query: "a", limit: 2 })
    expect(capped.matchesReturned).toBe(2)
    expect(capped.matchesTotal).toBe(full.matchesTotal)
    expect(capped.matchesReturned).toBeLessThan(capped.matchesTotal)
  })
})

// Backs the product promise that empty-query + `category` filter returns
// every record in a category. `search` caps at MAX_LIMIT, so this holds
// only while every category's record count stays strictly below the cap.
// If the zsh reference grows and a category approaches MAX_LIMIT, raise
// the constant (in `src/tools/search.ts`) before the test trips.
describe("MAX_LIMIT margin vs corpus", () => {
  test("every category fits within MAX_LIMIT", () => {
    for (const cat of docCategories) {
      const r = search(corpus, { category: cat, limit: MAX_LIMIT })
      expect(r.matchesTotal).toBeLessThan(MAX_LIMIT)
    }
  })
})
