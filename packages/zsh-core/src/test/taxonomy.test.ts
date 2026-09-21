import { describe, expect, expectTypeOf, test } from "vitest"
import { loadCorpus } from "../docs/corpus"
import { resolve, resolveAll } from "../docs/resolver"
import {
  type DocCategory,
  type DocRecord,
  type DocRecordMap,
  docCategories,
  isDocCategory,
  parseDocCategory,
} from "../docs/taxonomy"
import type { BuiltinDoc, ComplexCommandDoc, ZshOption } from "../docs/types"

const corpus = loadCorpus()

describe("parseDocCategory / isDocCategory", () => {
  test("accepts every docCategories entry", () => {
    for (const cat of docCategories) {
      expect(parseDocCategory(cat)).toBe(cat)
      expect(isDocCategory(cat)).toBe(true)
    }
  })

  test.each(["nope", "", "Option"])("rejects %j", raw => {
    expect(parseDocCategory(raw)).toBeUndefined()
    expect(isDocCategory(raw)).toBe(false)
  })
})

// Compile-time contract of `ResolvedHit<K>`: a resolved hit keeps its
// category's record type, also through a generic `K`; the record carries
// its category as a literal, and `DocRecord` discriminates on it.
describe("ResolvedHit types", () => {
  test("a K-shaped hit carries the K-shaped record", () => {
    const hit = resolve(corpus, "option", "AUTO_CD")
    if (hit === undefined) throw new Error("AUTO_CD did not resolve")
    expectTypeOf(hit.record).toEqualTypeOf<ZshOption>()
    expectTypeOf(hit.record.category).toEqualTypeOf<"option">()
    expectTypeOf(hit.record).toMatchTypeOf<DocRecord>()

    const viaK = <K extends DocCategory>(
      cat: K,
      raw: string,
    ): DocRecordMap[K] | undefined => resolve(corpus, cat, raw)?.record
    expectTypeOf(viaK("builtin", "echo")).toEqualTypeOf<
      BuiltinDoc | undefined
    >()
    expect(viaK("builtin", "echo")?.id).toBe("echo")
  })

  test("a walk hit's record is a DocRecord; category narrows it", () => {
    const [hit] = resolveAll(corpus, "for")
    if (hit === undefined) throw new Error("for did not resolve")
    expectTypeOf(hit.record).toEqualTypeOf<DocRecord>()
    if (hit.record.category !== "complex_command") {
      throw new Error("expected the complex-command hit first")
    }
    expectTypeOf(hit.record).toEqualTypeOf<ComplexCommandDoc>()
    expect(hit.record).toBe(corpus.complex_command.get(hit.record.id))
  })
})
