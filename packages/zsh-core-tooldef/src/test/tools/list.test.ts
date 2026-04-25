import { docCategories, loadCorpus, RECORDS_TOTAL } from "@carlwr/zsh-core"
import { describe, expect, test } from "vitest"
import { DEFAULT_LIMIT, list, MAX_LIMIT } from "../../../index.ts"

const corpus = loadCorpus()

describe("list", () => {
  test("no flags → first DEFAULT_LIMIT records, matchesTotal=RECORDS_TOTAL", () => {
    const r = list(corpus, {})
    expect(r.matches.length).toBe(DEFAULT_LIMIT)
    expect(r.matchesReturned).toBe(DEFAULT_LIMIT)
    expect(r.matchesTotal).toBe(RECORDS_TOTAL)
  })

  test("category filter restricts the pool", () => {
    const r = list(corpus, { category: "precmd", limit: MAX_LIMIT })
    for (const m of r.matches) expect(m.category).toBe("precmd")
    expect(r.matches.length).toBeGreaterThan(0)
    expect(r.matchesTotal).toBe(corpus.precmd.size)
  })

  test("limit=0 returns metadata only", () => {
    const r = list(corpus, { limit: 0 })
    expect(r.matches).toEqual([])
    expect(r.matchesReturned).toBe(0)
    expect(r.matchesTotal).toBe(RECORDS_TOTAL)
  })

  test("limit=0 with category", () => {
    const r = list(corpus, { category: "precmd", limit: 0 })
    expect(r.matches).toEqual([])
    expect(r.matchesTotal).toBe(corpus.precmd.size)
  })

  test("limit clamped to MAX_LIMIT (entire corpus)", () => {
    const r = list(corpus, { limit: 999_999 })
    expect(r.matches.length).toBeLessThanOrEqual(MAX_LIMIT)
    expect(r.matches.length).toBe(RECORDS_TOTAL)
  })

  test("MAX_LIMIT equals RECORDS_TOTAL", () => {
    expect(MAX_LIMIT).toBe(RECORDS_TOTAL)
  })

  test("unknown category yields empty matches", () => {
    const r = list(corpus, { category: "bogus" as never })
    expect(r.matches).toEqual([])
    expect(r.matchesTotal).toBe(0)
  })

  test("matches omit markdown body (size containment)", () => {
    const r = list(corpus, { limit: 5 })
    for (const m of r.matches) expect(m).not.toHaveProperty("markdown")
  })

  test("history match surfaces subKind", () => {
    const r = list(corpus, { category: "history", limit: 50 })
    expect(r.matches.length).toBeGreaterThan(0)
    for (const m of r.matches) {
      expect(["event-designator", "word-designator", "modifier"]).toContain(
        m.subKind,
      )
    }
  })

  test("builtin matches do NOT carry subKind key", () => {
    const r = list(corpus, { category: "builtin", limit: 1 })
    expect(r.matches[0]).not.toHaveProperty("subKind")
  })

  test("every category sums into RECORDS_TOTAL via list matchesTotal", () => {
    const sum = docCategories.reduce(
      (n, c) => n + list(corpus, { category: c, limit: 0 }).matchesTotal,
      0,
    )
    expect(sum).toBe(RECORDS_TOTAL)
  })
})
