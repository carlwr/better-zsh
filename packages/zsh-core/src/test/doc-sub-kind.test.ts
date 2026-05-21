import { describe, expect, test } from "vitest"
import { loadCorpus } from "../docs/corpus"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docSubKind,
  subKindOf,
} from "../docs/taxonomy"

const corpus = loadCorpus()

function firstRec<K extends DocCategory>(cat: K): DocRecordMap[K] {
  const rec = corpus[cat].values().next().value
  if (!rec) throw new Error(`empty corpus[${cat}]`)
  return rec as DocRecordMap[K]
}

describe("docSubKind", () => {
  test("history doc surfaces its kind string", () => {
    const doc = firstRec("history_expn")
    expect(docSubKind.history_expn(doc)).toBe(doc.kind)
    expect(["event-designator", "word-designator", "modifier"]).toContain(
      docSubKind.history_expn(doc),
    )
  })

  test("glob_op doc surfaces standard | ksh-like", () => {
    expect(["standard", "ksh-like"]).toContain(
      docSubKind.glob_op(firstRec("glob_op")),
    )
  })

  test("builtin doc has no subKind", () => {
    expect(docSubKind.builtin(firstRec("builtin"))).toBeUndefined()
  })

  test("every category resolves without throwing on a sample record", () => {
    for (const cat of docCategories) {
      // Skip stub categories with no records yet (e.g. mathfunc pending extractor).
      if (corpus[cat].size === 0) continue
      expect(() => subKindOf(cat, firstRec(cat))).not.toThrow()
    }
  })

  // Specific instance of a broader future invariant: per-category structural
  // fields should follow always-or-never on the corpus, so the tool-layer
  // output schema can encode presence structurally (required-when-non-undefined,
  // forbidden-when-undefined) rather than as optional. See DESIGN.md
  // §"`subKind` is always-or-never per category". When a second instance of
  // this pattern arises, generalize this test rather than adding a parallel
  // per-field one.
  test("subKindAlwaysOrNever: per-category subKind is always-or-never populated", () => {
    const mixed: { cat: string; defined: number; undef: number }[] = []
    for (const cat of docCategories) {
      let defined = 0
      let undef = 0
      for (const rec of corpus[cat].values()) {
        const v = subKindOf(cat, rec)
        if (v === undefined || v === null || v === "") undef++
        else defined++
      }
      if (defined > 0 && undef > 0) mixed.push({ cat, defined, undef })
    }
    expect(mixed).toEqual([])
  })
})
