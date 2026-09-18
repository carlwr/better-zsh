import { describe, expect, expectTypeOf, test } from "vitest"
import { mkDocumented } from "../docs/brands"
import { loadCorpus } from "../docs/corpus"
import { resolve } from "../docs/resolver"
import {
  type DocCategory,
  type DocRecordId,
  type DocRecordMap,
  docCategories,
  isDocCategory,
  mkRecordId,
  parseDocCategory,
  recordOf,
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

describe("recordOf", () => {
  test("hit: the record behind a resolved pid", () => {
    const pid = resolve(corpus, "option", "AUTO_CD")
    if (pid === undefined) throw new Error("AUTO_CD did not resolve")
    expect(recordOf(corpus, pid)?.display).toBe("AUTO_CD")
  })

  test("miss: undefined for a key the corpus lacks", () => {
    const pid = mkRecordId(
      "builtin",
      mkDocumented("builtin", "no-such-builtin"),
    )
    expect(recordOf(corpus, pid)).toBeUndefined()
  })

  // Compile-time contract of `DocRecordIdOf<K>`: a resolved pid keeps its
  // category's record type, also through a generic `K`, while staying
  // assignable to the `DocRecordId` union.
  test("types: a K-shaped pid yields the K-shaped record", () => {
    const pid = resolve(corpus, "option", "AUTO_CD")
    if (pid === undefined) throw new Error("AUTO_CD did not resolve")
    expectTypeOf(recordOf(corpus, pid)).toEqualTypeOf<ZshOption | undefined>()
    expectTypeOf(pid).toMatchTypeOf<DocRecordId>()

    const viaK = <K extends DocCategory>(
      cat: K,
      raw: string,
    ): DocRecordMap[K] | undefined => {
      const p = resolve(corpus, cat, raw)
      return p && recordOf(corpus, p)
    }
    expectTypeOf(viaK("builtin", "echo")).toEqualTypeOf<
      BuiltinDoc | undefined
    >()
    expect(viaK("builtin", "echo")?.name).toBe("echo")
  })
})
