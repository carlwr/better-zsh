import { describe, expect, test } from "vitest"
import type { BaseMatch } from "../../tools/shared/entries.ts"
import { fuzzySortMatches } from "../../tools/shared/search-fuzzy.ts"

const pool = (n: number): BaseMatch[] =>
  Array.from({ length: n }, (_, i) => ({
    category: "builtin",
    id: `abc${i}`,
    display: `abc${i}`,
  }))

describe("fuzzySortMatches", () => {
  // fuzzysort's own `limit` default went from unlimited to 10 in v4; a
  // capped tier silently under-reports `matchesTotal`.
  test("returns the whole matching pool, uncapped", () => {
    const entries = pool(25)
    expect(fuzzySortMatches("abc", entries).length).toBe(entries.length)
  })
})
