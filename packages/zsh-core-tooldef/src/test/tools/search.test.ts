import { loadCorpus, RECORDS_TOTAL } from "@carlwr/zsh-core"
import { describe, expect, test } from "vitest"
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
    const r = search(corpus, {
      query: "command",
      category: "precmd",
      limit: 100,
    })
    for (const m of r.matches) expect(m.category).toBe("precmd")
    expect(r.matches.length).toBeGreaterThan(0)
  })

  test("empty query returns empty matches[]", () => {
    const r = search(corpus, { query: "", limit: 7 })
    expect(r.matches).toEqual([])
    expect(r.matchesReturned).toBe(0)
    expect(r.matchesTotal).toBe(0)
  })

  test("whitespace-only query returns empty matches[]", () => {
    const r = search(corpus, { query: "   " })
    expect(r.matches).toEqual([])
  })

  test("limit clamped to MAX_LIMIT", () => {
    const r = search(corpus, { query: "a", limit: 999_999 })
    expect(r.matches.length).toBeLessThanOrEqual(MAX_LIMIT)
  })

  test("limit=0 returns metadata only", () => {
    const r = search(corpus, { query: "echo", limit: 0 })
    expect(r.matches).toEqual([])
    expect(r.matchesReturned).toBe(0)
    expect(r.matchesTotal).toBeGreaterThan(0)
  })

  test("default limit is DEFAULT_LIMIT when unspecified", () => {
    const r = search(corpus, { query: "a" })
    expect(r.matches.length).toBeLessThanOrEqual(DEFAULT_LIMIT)
  })

  test("fuzzy match surfaces score", () => {
    const r = search(corpus, { query: "atcd", category: "option", limit: 3 })
    const hit = r.matches.find(m => m.id === "autocd")
    expect(hit).toBeDefined()
    expect(typeof hit?.score).toBe("number")
  })

  test("no match returns empty", () => {
    const r = search(corpus, { query: "zzzz_definitely_not_a_zsh_thing_qq" })
    expect(r.matches).toEqual([])
  })

  test("history match surfaces subKind", () => {
    const r = search(corpus, { query: "!", category: "history", limit: 50 })
    expect(r.matches.length).toBeGreaterThan(0)
    for (const m of r.matches) {
      expect(["event-designator", "word-designator", "modifier"]).toContain(
        m.subKind,
      )
    }
  })

  test("builtin match has no subKind key", () => {
    const r = search(corpus, { query: "echo", category: "builtin", limit: 1 })
    expect(r.matches[0]).toBeDefined()
    expect(r.matches[0]).not.toHaveProperty("subKind")
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
    const r2 = search(corpus, { query: "x", limit: MAX_LIMIT })
    expect(r2.matchesReturned).toBe(r2.matches.length)
    const r3 = search(corpus, { query: "zzzz_definitely_not_a_zsh_thing_qq" })
    expect(r3.matchesReturned).toBe(0)
    expect(r3.matchesTotal).toBe(0)
  })

  test("matchesTotal counts pre-truncation matches (fuzzy branch)", () => {
    const full = search(corpus, { query: "a", limit: MAX_LIMIT })
    const capped = search(corpus, { query: "a", limit: 2 })
    expect(capped.matchesReturned).toBe(2)
    expect(capped.matchesTotal).toBe(full.matchesTotal)
    expect(capped.matchesReturned).toBeLessThan(capped.matchesTotal)
  })

  test("MAX_LIMIT equals RECORDS_TOTAL (full-corpus retrieval is in-spec)", () => {
    expect(MAX_LIMIT).toBe(RECORDS_TOTAL)
  })
})
