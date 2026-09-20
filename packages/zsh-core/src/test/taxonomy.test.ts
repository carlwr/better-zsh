import { describe, expect, expectTypeOf, test } from "vitest"
import { loadCorpus } from "../docs/corpus"
import { resolve } from "../docs/resolver"
import {
  type DocCategory,
  type DocRecordId,
  type DocRecordMap,
  docCategories,
  isDocCategory,
  parseDocCategory,
} from "../docs/taxonomy"
import type { BuiltinDoc, ZshOption } from "../docs/types"

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

// Compile-time contract of `DocRecordIdOf<K>`: a resolved hit keeps its
// category's record type, also through a generic `K`, while staying
// assignable to the `DocRecordId` union.
describe("ResolvedHit types", () => {
  test("a K-shaped hit carries the K-shaped record", () => {
    const hit = resolve(corpus, "option", "AUTO_CD")
    if (hit === undefined) throw new Error("AUTO_CD did not resolve")
    expectTypeOf(hit.record).toEqualTypeOf<ZshOption>()
    expectTypeOf(hit).toMatchTypeOf<DocRecordId>()

    const viaK = <K extends DocCategory>(
      cat: K,
      raw: string,
    ): DocRecordMap[K] | undefined => resolve(corpus, cat, raw)?.record
    expectTypeOf(viaK("builtin", "echo")).toEqualTypeOf<
      BuiltinDoc | undefined
    >()
    expect(viaK("builtin", "echo")?.name).toBe("echo")
  })
})
