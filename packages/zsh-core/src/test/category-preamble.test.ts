import { describe, expect, test } from "vitest"
import { docCategoryPreamble } from "../docs/category-preamble"
import { docCategories } from "../docs/taxonomy"

describe("docCategoryPreamble", () => {
  test("history preamble is a non-empty string mentioning event and modifier", () => {
    const pre = docCategoryPreamble.history_expn
    expect(typeof pre).toBe("string")
    expect(pre?.length).toBeGreaterThan(0)
    expect(pre).toMatch(/event/i)
    expect(pre).toMatch(/modifier/i)
  })

  test("non-history categories have no preamble", () => {
    for (const cat of docCategories) {
      if (cat === "history_expn") continue
      expect(docCategoryPreamble[cat]).toBeUndefined()
    }
  })

  // Type system already constrains keys to DocCategory; this guards against
  // a stray cast at the declaration site.
  test("no extraneous keys outside DocCategory", () => {
    const extraneous = Object.keys(docCategoryPreamble).filter(
      k => !(docCategories as readonly string[]).includes(k),
    )
    expect(extraneous).toEqual([])
  })
})
