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
})
