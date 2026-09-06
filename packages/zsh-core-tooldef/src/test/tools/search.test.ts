import { allUnique } from "@carlwr/typescript-extra"
import { loadCorpus } from "@carlwr/zsh-core"
import { type DocCategory, subKindEnums } from "@carlwr/zsh-core/taxonomy"
import { describe, expect, test } from "vitest"
import { DEFAULT_LIMIT, MAX_LIMIT, search } from "../../../index.ts"

const corpus = loadCorpus()

describe("search", () => {
  test("exact id wins over prefix and fuzzy", () => {
    const r = search(corpus, { query: "echo", category: "builtin", limit: 5 })
    expect(r.matches[0]?.id).toBe("echo")
    expect(r.matches[0]?.score).toBe(1.0)
  })

  test("prefix match returns with score 1.0", () => {
    const r = search(corpus, { query: "auto", category: "option", limit: 5 })
    expect(r.matches.length).toBeGreaterThan(0)
    expect(r.matches[0]?.id.startsWith("auto")).toBe(true)
    for (const m of r.matches) expect(m.score).toBe(1.0)
  })

  test("category filter narrows results", () => {
    const r = search(corpus, {
      query: "command",
      category: "precmd_modifier",
      limit: 100,
    })
    for (const m of r.matches) expect(m.category).toBe("precmd_modifier")
    expect(r.matches.length).toBeGreaterThan(0)
  })

  test("unknown category yields empty matches", () => {
    const r = search(corpus, {
      query: "echo",
      category: "bogus" as DocCategory,
    })
    expect(r.matches).toEqual([])
    expect(r.matchesReturned).toBe(0)
    expect(r.matchesTotal).toBe(0)
  })

  test.each([{ query: "" }, { query: "   " }])(
    '"$query" → empty matches[]',
    ({ query }) => {
      const r = search(corpus, { query, limit: 7 })
      expect(r.matches).toEqual([])
      expect(r.matchesReturned).toBe(0)
      expect(r.matchesTotal).toBe(0)
    },
  )

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

  test("fuzzy match surfaces score < 1.0", () => {
    const r = search(corpus, { query: "atcd", category: "option", limit: 3 })
    const hit = r.matches.find(m => m.id === "autocd")
    expect(hit).toBeDefined()
    expect(typeof hit?.score).toBe("number")
    expect(hit?.score).toBeLessThan(1.0)
  })

  test("resolver tier: au_to_cd resolves to autocd (option)", () => {
    const r = search(corpus, { query: "au_to_cd", limit: 5 })
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0]?.category).toBe("option")
    expect(r.matches[0]?.id).toBe("autocd")
    expect(r.matches[0]?.score).toBe(1.0)
  })

  test("resolver tier: NO_AUTO_CD resolves via NO_-stripping", () => {
    const r = search(corpus, { query: "NO_AUTO_CD", limit: 5 })
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0]?.category).toBe("option")
    expect(r.matches[0]?.id).toBe("autocd")
    expect(r.matches[0]?.score).toBe(1.0)
  })

  test("AUTO_CD: exact tier only (no resolver duplicate)", () => {
    const r = search(corpus, { query: "AUTO_CD", limit: 5 })
    // Display matches `AUTO_CD`; id is `autocd`. Resolver would hit the same id.
    const optHits = r.matches.filter(
      m => m.category === "option" && m.id === "autocd",
    )
    expect(optHits).toHaveLength(1)
    expect(optHits[0]?.score).toBe(1.0)
  })

  test("dedup invariant: no two matches share (category, id)", () => {
    // Regression: seen-set spans exact/resolver/prefix/fuzzy.
    const queries = [
      "AUTO_CD",
      "au_to_cd",
      "NO_AUTO_CD",
      "for",
      "echo",
      "a",
      "auto",
      "atcd",
    ]
    for (const query of queries) {
      const r = search(corpus, { query, limit: 200 })
      const keys = r.matches.map(m => `${m.category}\0${m.id}`)
      expect(allUnique(keys)).toBe(true)
    }
  })

  test("every match carries a numeric score", () => {
    const queries = ["echo", "auto", "atcd", "au_to_cd", "a"]
    for (const query of queries) {
      const r = search(corpus, { query, limit: 50 })
      for (const m of r.matches) expect(typeof m.score).toBe("number")
    }
  })

  test("no match returns empty", () => {
    const r = search(corpus, { query: "zzzz_definitely_not_a_zsh_thing_qq" })
    expect(r.matches).toEqual([])
  })

  test("history match surfaces subKind", () => {
    const r = search(corpus, {
      query: "!",
      category: "history_expn",
      limit: 50,
    })
    expect(r.matches.length).toBeGreaterThan(0)
    const allowed = subKindEnums.history_expn
    for (const m of r.matches) expect(allowed).toContain(m.subKind)
  })

  test("builtin match has no subKind key", () => {
    const r = search(corpus, { query: "echo", category: "builtin", limit: 1 })
    expect(r.matches[0]).toBeDefined()
    expect(r.matches[0]).not.toHaveProperty("subKind")
  })

  test("results omit mdBody (size containment)", () => {
    const r = search(corpus, { query: "echo" })
    for (const m of r.matches) {
      expect(m).not.toHaveProperty("mdBody")
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
})
