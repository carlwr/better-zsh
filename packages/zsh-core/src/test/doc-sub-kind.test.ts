import { describe, expect, test } from "vitest"
import { mkDocumented } from "../docs/brands"
import { loadCorpus } from "../docs/corpus"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docSubKind,
  subKindEnums,
  subKindOf,
} from "../docs/taxonomy"
import type { BuiltinDoc, ShellParamDoc } from "../docs/types"
import { emptyCorpus } from "./id-fns"

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
      expect(() => subKindOf(cat, firstRec(cat))).not.toThrow()
    }
  })

  // Specific instance of a broader future invariant: per-category structural
  // fields should follow always-or-never on the corpus, so a tool output
  // schema can encode presence structurally (required-when-non-undefined,
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

describe("subKindEnums", () => {
  test("vendored corpus: sorted, de-duplicated per category; undefined where none", () => {
    const enums = subKindEnums(corpus)
    expect(Object.keys(enums)).toEqual([...docCategories])
    for (const cat of docCategories) {
      const seen = new Set<string>()
      for (const rec of corpus[cat].values()) {
        const k = subKindOf(cat, rec)
        if (k !== undefined) seen.add(k)
      }
      expect(enums[cat], cat).toEqual(
        seen.size === 0 ? undefined : [...seen].sort(),
      )
    }
    expect(enums.history_expn).toEqual([
      "event-designator",
      "modifier",
      "word-designator",
    ])
    expect(enums.builtin).toBeUndefined()
  })

  test("small corpus", () => {
    const sp = (
      name: string,
      scope: ShellParamDoc["scope"],
    ): ShellParamDoc => ({
      name: mkDocumented("special_param", name),
      desc: "",
      scope,
    })
    const echo: BuiltinDoc = {
      name: mkDocumented("builtin", "echo"),
      synopsis: ["echo"],
      desc: "",
    }
    const small = emptyCorpus({
      special_param: new Map(
        [
          sp("SECONDS", "shell-set"),
          sp("HOME", "shell-used"),
          sp("PWD", "shell-set"),
        ].map(d => [d.name, d]),
      ),
      builtin: new Map([[echo.name, echo]]),
    })
    const enums = subKindEnums(small)
    expect(enums.special_param).toEqual(["shell-set", "shell-used"])
    expect(enums.builtin).toBeUndefined()
    expect(enums.option).toBeUndefined()
  })
})
