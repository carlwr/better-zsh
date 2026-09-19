import { describe, expect, test } from "vitest"
import { loadCorpus } from "../docs/corpus"
import { docCategories } from "../docs/taxonomy"

// Pins the shape behind "lazy per category, cached": accessor fields on a
// frozen object, one per category, each yielding one stable map.
describe("loadCorpus", () => {
  const corpus = loadCorpus()

  test("is frozen, with exactly the categories as enumerable accessors", () => {
    expect(Object.isFrozen(corpus)).toBe(true)
    expect(Object.keys(corpus)).toEqual([...docCategories])
    for (const cat of docCategories) {
      const desc = Object.getOwnPropertyDescriptor(corpus, cat)
      expect(desc?.enumerable).toBe(true)
      expect(typeof desc?.get).toBe("function")
    }
  })

  test("returns the same map on every read of a category", () => {
    for (const cat of docCategories) {
      const first = corpus[cat]
      expect(first).toBeInstanceOf(Map)
      expect(corpus[cat]).toBe(first)
    }
  })

  test("is itself cached", () => {
    expect(loadCorpus()).toBe(corpus)
  })
})
