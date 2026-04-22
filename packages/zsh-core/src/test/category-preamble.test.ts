import { describe, expect, test } from "vitest"
import { docCategoryPreamble } from "../docs/category-preamble"
import { docCategories } from "../docs/taxonomy"

describe("docCategoryPreamble", () => {
  test("history preamble is a non-empty string mentioning event and modifier", () => {
    const pre = docCategoryPreamble.history
    expect(typeof pre).toBe("string")
    expect(pre?.length).toBeGreaterThan(0)
    expect(pre).toMatch(/event/i)
    expect(pre).toMatch(/modifier/i)
  })

  test("non-history categories have no preamble", () => {
    for (const cat of docCategories) {
      if (cat === "history") continue
      expect(docCategoryPreamble[cat]).toBeUndefined()
    }
  })

  test("table has an entry for every DocCategory", () => {
    for (const cat of docCategories) {
      expect(cat in docCategoryPreamble).toBe(true)
    }
    // Extraneous keys — guard against accidental typos introducing a key
    // outside the DocCategory union.
    const extraneous = Object.keys(docCategoryPreamble).filter(
      k => !(docCategories as readonly string[]).includes(k),
    )
    expect(extraneous).toEqual([])
  })
})
