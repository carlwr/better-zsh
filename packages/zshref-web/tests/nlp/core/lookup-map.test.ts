// The consumer side of the lookup map: `lookupIndex` and `promoteToTop` on
// hand-made maps and rankings, then as properties (the build side and the
// map's coverage: tests/nlp/node/lookup-map.test.ts).

import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { lookupIndex, promoteToTop } from "../../../nlp/core/lookup-map"
import { NO_SEMANTIC } from "../../../nlp/core/rank"
import {
  type RankedMatch,
  type RecordId,
  recordKey,
  sameRecord,
} from "../../../nlp/core/types"
import { makeRecordText } from "../../_fixtures"

const match = (category: string, id: string, score: number): RankedMatch => ({
  rec: makeRecordText({ category, category_label: category, id, display: id }),
  score,
  debug: { semantic: NO_SEMANTIC, boosts: { category: 0, lexical: 0 } },
})
const ranked: readonly RankedMatch[] = [
  match("option", "a", 1),
  match("builtin", "b", 0.9),
  match("option", "c", 0.8),
]
const ids = (rs: readonly RankedMatch[]): string[] => rs.map(m => m.rec.id)

describe("promoteToTop", () => {
  it.each([
    [
      "a hit below slot 0 moves to slot 0, the rest in order",
      { category: "option", id: "c" },
      ["c", "a", "b"],
    ],
    [
      "a hit already at slot 0 stays",
      { category: "option", id: "a" },
      ["a", "b", "c"],
    ],
    [
      "category and id must both match",
      { category: "builtin", id: "c" },
      ["a", "b", "c"],
    ],
    ["no hit, no change", null, ["a", "b", "c"]],
  ])("%s", (_, hit, want) => {
    expect(ids(promoteToTop(ranked, hit))).toEqual(want)
    expect(ids(ranked)).toEqual(["a", "b", "c"])
  })
})

// --- properties ---------------------------------------------------------------

const arbId = fc.stringMatching(/^[a-z?>_]{1,3}$/)
const arbRecordId: fc.Arbitrary<RecordId> = fcu.record({
  category: fcu.element(["option", "builtin", "redirection"]),
  id: arbId,
})
/** Distinct identities, scores descending as the ranker leaves them. */
const arbRanked: fc.Arbitrary<RankedMatch[]> = fc
  .uniqueArray(arbRecordId, { maxLength: 8, selector: recordKey })
  .map(recs => recs.map((r, i) => match(r.category, r.id, 1 - i / 10)))

describe("promoteToTop properties", () => {
  it("a permutation: the hit at slot 0 when present, the others in their order; else no change", () => {
    fc.assert(
      fc.property(
        arbRanked,
        fc.option(arbRecordId, { nil: null }),
        (before, hit) => {
          const after = promoteToTop(before, hit)
          const present =
            hit !== null && before.some(m => sameRecord(m.rec, hit))
          if (!present) {
            expect(after).toEqual(before)
            return
          }
          expect(after[0]?.rec).toEqual(expect.objectContaining(hit))
          expect(after.slice(1)).toEqual(
            before.filter(m => !sameRecord(m.rec, hit)),
          )
        },
      ),
    )
  })
})

const arbMap = fc.uniqueArray(
  fcu.record({
    raw: fc.stringMatching(/^[A-Za-z_]{1,4}$/),
    category: fc.constant("option"),
    id: arbId,
  }),
  { maxLength: 6, selector: e => e.raw },
)

describe("lookupIndex properties", () => {
  it("resolves the trimmed query verbatim, else lowercased, else not at all", () => {
    fc.assert(
      fc.property(
        arbMap,
        fc.stringMatching(/^[A-Za-z_]{0,4}$/),
        fcu.element(["", " ", "\t", "  "]),
        (entries, q, pad) => {
          const idx = lookupIndex({ version: 1, entries })
          const byRaw = new Map(
            entries.map(e => [e.raw, { category: e.category, id: e.id }]),
          )
          const want = byRaw.get(q) ?? byRaw.get(q.toLowerCase()) ?? null
          expect(idx.lookup(`${pad}${q}${pad}`)).toEqual(q === "" ? null : want)
        },
      ),
    )
  })
})
