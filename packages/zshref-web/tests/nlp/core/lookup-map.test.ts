// The consumer side of the lookup map: `lookupIndex` and `promoteToTop` on
// hand-made maps and rankings, then as properties (the build side and the
// map's coverage: tests/nlp/node/lookup-map.test.ts).

import * as fcu from "@carlwr/fastcheck-utils"
import { isNonEmpty } from "@carlwr/typescript-extra"
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
  it("category and id must both match", () => {
    const hit = { category: "builtin", id: "c" }
    expect(ids(promoteToTop(ranked, hit))).toEqual(["a", "b", "c"])
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

/** A ranking and a hit, drawn from the ranking half the time it is non-empty. */
const arbRankedHit = arbRanked.chain(before => {
  const recIds = before.map(m => ({ category: m.rec.category, id: m.rec.id }))
  return fcu.record({
    before: fc.constant(before),
    hit: fc.option(
      isNonEmpty(recIds)
        ? fc.oneof(arbRecordId, fcu.element(recIds))
        : arbRecordId,
      { nil: null },
    ),
  })
})

describe("promoteToTop properties", () => {
  it("a permutation: the hit at slot 0 when present, the others in their order; else no change; the input untouched", () => {
    const cov = fcu.coverage({ belowTop: 10, absent: 20 })
    fc.assert(
      fc.property(arbRankedHit, ({ before, hit }) => {
        const snapshot = structuredClone(before)
        const after = promoteToTop(before, hit)
        expect(before).toEqual(snapshot)
        const present = hit !== null && before.some(m => sameRecord(m.rec, hit))
        if (!present) {
          cov.hit("absent")
          expect(after).toEqual(before)
          return
        }
        if (!sameRecord(before[0]?.rec ?? hit, hit)) cov.hit("belowTop")
        expect(after[0]?.rec).toEqual(expect.objectContaining(hit))
        expect(after.slice(1)).toEqual(
          before.filter(m => !sameRecord(m.rec, hit)),
        )
      }),
      { plugins: [cov.plugin] },
    )
  })
})

// Lowercase keys half the time, so an uppercased query takes the fallback.
const arbRaw = fc.oneof(
  fc.stringMatching(/^[A-Za-z_]{1,4}$/),
  fc.stringMatching(/^[a-z_]{1,4}$/),
)
const arbMap = fc.uniqueArray(
  fcu.record({ raw: arbRaw, category: fc.constant("option"), id: arbId }),
  { maxLength: 6, selector: e => e.raw },
)
/** A map and a query that often names a key: verbatim, upper- or lowercased. */
const arbMapQuery = arbMap.chain(entries => {
  const raws = entries.map(e => e.raw)
  const arbQ = fc.stringMatching(/^[A-Za-z_]{0,4}$/)
  const key = isNonEmpty(raws) ? fcu.element(raws) : null
  return fcu.record({
    entries: fc.constant(entries),
    q: key
      ? fc.oneof(
          arbQ,
          key,
          key.map(k => k.toUpperCase()),
          key.map(k => k.toLowerCase()),
        )
      : arbQ,
    pad: fcu.element(["", " ", "\t", "  "]),
  })
})

describe("lookupIndex properties", () => {
  it("resolves the trimmed query verbatim, else lowercased, else not at all", () => {
    const cov = fcu.coverage({ verbatim: 15, lowercased: 5, miss: 20 })
    fc.assert(
      fc.property(arbMapQuery, ({ entries, q, pad }) => {
        const idx = lookupIndex({ version: 1, entries })
        const byRaw = new Map(
          entries.map(e => [e.raw, { category: e.category, id: e.id }]),
        )
        const want = byRaw.get(q) ?? byRaw.get(q.toLowerCase()) ?? null
        expect(idx.lookup(`${pad}${q}${pad}`)).toEqual(q === "" ? null : want)
        if (q === "" || want === null) cov.hit("miss")
        else cov.hit(byRaw.has(q) ? "verbatim" : "lowercased")
      }),
      { plugins: [cov.plugin] },
    )
  })
})
