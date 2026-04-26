import { describe, expect, test } from "vitest"
import { loadCorpus } from "../docs/corpus"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docSubKind,
} from "../docs/taxonomy"

const corpus = loadCorpus()

function firstRec<K extends DocCategory>(cat: K): DocRecordMap[K] {
  const rec = corpus[cat].values().next().value
  if (!rec) throw new Error(`empty corpus[${cat}]`)
  return rec as DocRecordMap[K]
}

describe("docSubKind", () => {
  test("history doc surfaces its kind string", () => {
    const doc = firstRec("history")
    expect(docSubKind.history(doc)).toBe(doc.kind)
    expect(["event-designator", "word-designator", "modifier"]).toContain(
      docSubKind.history(doc),
    )
  })

  test("glob_op doc surfaces standard | ksh-like", () => {
    const doc = firstRec("glob_op")
    expect(["standard", "ksh-like"]).toContain(docSubKind.glob_op(doc))
  })

  test("builtin doc has no subKind", () => {
    expect(docSubKind.builtin(firstRec("builtin"))).toBeUndefined()
  })

  test("every category resolves without throwing on a sample record", () => {
    for (const cat of docCategories) {
      const rec = firstRec(cat)
      const fn = docSubKind[cat] as (d: typeof rec) => string | undefined
      expect(() => fn(rec)).not.toThrow()
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
      const map = corpus[cat] as ReadonlyMap<string, DocRecordMap[DocCategory]>
      const fn = docSubKind[cat] as (
        d: DocRecordMap[DocCategory],
      ) => string | undefined
      let defined = 0
      let undef = 0
      for (const rec of map.values()) {
        const v = fn(rec)
        if (v === undefined || v === null || v === "") undef++
        else defined++
      }
      if (defined > 0 && undef > 0) mixed.push({ cat, defined, undef })
    }
    expect(mixed).toEqual([])
  })
})
