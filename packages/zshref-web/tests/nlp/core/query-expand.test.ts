// Named cases, then properties over generated rule sets and queries.

import * as fcu from "@carlwr/fastcheck-utils"
import { allUnique, withoutFirstSubstring } from "@carlwr/typescript-extra"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  expandQueryForEmbedding,
  MAX_APPENDED,
} from "../../../nlp/core/query-expand"
import type { QueryExpansion } from "../../../nlp/core/rules"

const rule = (when: string[], add: string): QueryExpansion => ({ when, add })

describe("expandQueryForEmbedding", () => {
  it("appends the canonical term on a trigger", () => {
    const rules = [rule(["setting", "settings"], "option")]
    expect(expandQueryForEmbedding("toggle a setting", rules)).toBe(
      "toggle a setting option",
    )
  })

  it("no trigger leaves the query untouched", () => {
    const rules = [rule(["setting"], "option")]
    expect(expandQueryForEmbedding("list aliases", rules)).toBe("list aliases")
  })

  it("a canonical term already present is not appended", () => {
    const rules = [rule(["setting"], "option")]
    // "options" is a different word; "option" as a whole word is present here,
    // so the exact canonical word blocks the append.
    expect(expandQueryForEmbedding("setting option", rules)).toBe(
      "setting option",
    )
  })

  it("a trigger matches whole words only", () => {
    const rules = [rule(["env"], "environment")]
    // "prevent" contains "env" as a substring but not as a word.
    expect(expandQueryForEmbedding("prevent errors", rules)).toBe(
      "prevent errors",
    )
  })

  it("the append count is capped", () => {
    const rules = [rule(["a"], "one"), rule(["b"], "two"), rule(["c"], "three")]
    expect(expandQueryForEmbedding("a b c", rules)).toBe("a b c one two")
  })
})

// --- properties ---------------------------------------------------------------

// One small shared vocabulary, so triggers and canonical terms actually occur
// in queries (independent draws almost never meet). Lowercase alphanumeric:
// a term compares as stored (the loader lowercases), and the whole-word split
// is the only tokenization.
const arbWord = fcu.element([
  "set",
  "setting",
  "option",
  "env",
  "var",
  "file",
  "glob",
  "a1",
])
const arbTerm = fc.oneof(
  { weight: 3, arbitrary: arbWord },
  fc.tuple(arbWord, arbWord).map(ws => ws.join(" ")),
)
const arbRules = fc.array(
  fcu.record({
    when: fcu.nonEmptyArray(arbTerm, { maxLength: 3 }),
    add: arbWord,
  }),
  { maxLength: 6 },
)
// The casing noise must not matter.
const arbQuery = fc
  .array(
    fc
      .tuple(arbWord, fc.boolean())
      .map(([w, up]) => (up ? w.toUpperCase() : w)),
    { maxLength: 6 },
  )
  .map(ws => ws.join(" "))

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 0)
const wordIn = (hay: string, needle: string): boolean =>
  needle.includes(" ")
    ? hay.toLowerCase().includes(needle)
    : words(hay).includes(needle)
/** The terms `expanded` appended to `query`. */
const appended = (query: string, expanded: string): string[] =>
  words(withoutFirstSubstring(query, expanded))

describe("expandQueryForEmbedding properties", () => {
  it("is deterministic and append-only: ≤ cap distinct fired-rule terms absent from the query; below the cap, every fired rule's term", () => {
    const cov = fcu.coverage({ appends: 15, capped: 5 })
    fc.assert(
      fc.property(arbRules, arbQuery, (rules, q) => {
        const e = expandQueryForEmbedding(q, rules)
        expect(expandQueryForEmbedding(q, rules)).toBe(e)
        expect(e.startsWith(q)).toBe(true)
        const fired = rules.filter(r => r.when.some(w => wordIn(q, w)))
        const adds = appended(q, e)
        expect(adds.length).toBeLessThanOrEqual(MAX_APPENDED)
        expect(allUnique(adds)).toBe(true)
        for (const a of adds) {
          expect(fired.some(r => r.add === a)).toBe(true)
          expect(wordIn(q, a)).toBe(false)
        }
        if (adds.length > 0) cov.hit("appends")
        if (adds.length === MAX_APPENDED) cov.hit("capped")
        if (adds.length < MAX_APPENDED)
          for (const r of fired)
            expect(wordIn(q, r.add) || adds.includes(r.add)).toBe(true)
      }),
      { plugins: [cov.plugin] },
    )
  })

  it("re-expanding appends nothing already present; nothing at all below the cap, chains aside", () => {
    const cov = fcu.coverage({ settled: 3 })
    fc.assert(
      fc.property(arbRules, arbQuery, (rules, q) => {
        const e1 = expandQueryForEmbedding(q, rules)
        const e2 = expandQueryForEmbedding(e1, rules)
        const again = appended(e1, e2)
        expect(again.length).toBeLessThanOrEqual(MAX_APPENDED)
        for (const a of again) expect(wordIn(e1, a)).toBe(false)
        // Below the cap, every firing rule's term is already in e1 — unless
        // an appended term is itself a trigger (a chain), which may fire anew.
        const chained = rules.some(r =>
          r.when.some(w => !wordIn(q, w) && wordIn(e1, w)),
        )
        const n = appended(q, e1).length
        if (n < MAX_APPENDED && !chained) {
          expect(e2).toBe(e1)
          if (n > 0) cov.hit("settled")
        }
      }),
      { plugins: [cov.plugin] },
    )
  })
})
