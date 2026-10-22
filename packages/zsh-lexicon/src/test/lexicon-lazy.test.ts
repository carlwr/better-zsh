import { describe, expect, test } from "vitest"
import { loadLexicon } from "../docs/lexicon"
import { docCategories } from "../docs/taxonomy"

// Pins the shape behind "lazy per category, cached": accessor fields on a
// frozen object, one per category, each yielding one stable map.
describe("loadLexicon", () => {
  const lexicon = loadLexicon()

  test("is frozen, with exactly the categories as enumerable accessors", () => {
    expect(Object.isFrozen(lexicon)).toBe(true)
    expect(Object.keys(lexicon)).toEqual([...docCategories])
    for (const cat of docCategories) {
      const desc = Object.getOwnPropertyDescriptor(lexicon, cat)
      expect(desc?.enumerable).toBe(true)
      expect(typeof desc?.get).toBe("function")
    }
  })

  test("returns the same map on every read of a category", () => {
    for (const cat of docCategories) {
      const first = lexicon[cat]
      expect(first).toBeInstanceOf(Map)
      expect(lexicon[cat]).toBe(first)
    }
  })

  test("is itself cached", () => {
    expect(loadLexicon()).toBe(lexicon)
  })
})
