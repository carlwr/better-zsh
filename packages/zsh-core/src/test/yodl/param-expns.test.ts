import { describe, expect, test } from "vitest"
import { parseParamExpns } from "../../docs/yodl/extractors/param-expns"
import { mkDocumented_ } from "../id-fns"
import { by, expectDocCorpus, only, readVendoredYo } from "./test-util"

const EXPN_YO = readVendoredYo("expn.yo")
const pex = mkDocumented_("param_expn")

describe("parseParamExpns", () => {
  test("parses plain form as solo group", () => {
    const yo = [
      "sect(Parameter Expansion)",
      "startitem()",
      "item(tt(${)var(name)tt(}))(The value of var(name).)",
      "enditem()",
    ].join("\n")
    const doc = only(parseParamExpns(yo))
    expect(doc.sig).toBe(pex("${name}"))
    expect(doc.groupSigs).toEqual(["${name}"])
    expect(doc.orderInGroup).toBe(0)
    expect(doc.subKind).toBe("plain")
    expect(doc.placeholders).toEqual(["name"])
    expect(doc.desc).toContain("value")
    expect(doc.section).toBe("Parameter Expansion")
  })

  test("xitem + item group preserves manual source order", () => {
    const yo = [
      "sect(Parameter Expansion)",
      "startitem()",
      "xitem(tt(${)var(name)tt(-)var(word)tt(}))",
      "item(tt(${)var(name)tt(:-)var(word)tt(}))(",
      "If var(name) is set, substitute its value; otherwise var(word).",
      ")",
      "enditem()",
    ].join("\n")
    const docs = parseParamExpns(yo)
    expect(docs.map(d => d.sig as string)).toEqual([
      "${name-word}",
      "${name:-word}",
    ])
    expect(docs.map(d => d.orderInGroup)).toEqual([0, 1])
    expect(docs.every(d => d.subKind === "default")).toBe(true)
    expect(docs.every(d => d.groupSigs.length === 2)).toBe(true)
    expect(docs[0]?.groupSigs).toEqual(["${name-word}", "${name:-word}"])
    // Shared desc across the group.
    expect(docs[0]?.desc).toBe(docs[1]?.desc)
  })

  test("three-form replace group classifies each as `replace`", () => {
    const yo = [
      "sect(Parameter Expansion)",
      "startitem()",
      "xitem(tt(${)var(name)tt(/)var(pattern)tt(/)var(repl)tt(}))",
      "xitem(tt(${)var(name)tt(//)var(pattern)tt(/)var(repl)tt(}))",
      "item(tt(${)var(name)tt(:/)var(pattern)tt(/)var(repl)tt(}))(Replace.)",
      "enditem()",
    ].join("\n")
    const docs = parseParamExpns(yo)
    expect(docs.map(d => d.sig as string)).toEqual([
      "${name/pattern/repl}",
      "${name//pattern/repl}",
      "${name:/pattern/repl}",
    ])
    expect(docs.every(d => d.subKind === "replace")).toBe(true)
    expect(docs.every(d => d.placeholders.length === 3)).toBe(true)
  })

  test("substring form with optional length has 3 placeholders", () => {
    const yo = [
      "sect(Parameter Expansion)",
      "startitem()",
      "xitem(tt(${)var(name)tt(:)var(offset)tt(}))",
      "item(tt(${)var(name)tt(:)var(offset)tt(:)var(length)tt(}))(Substring.)",
      "enditem()",
    ].join("\n")
    const docs = by(parseParamExpns(yo), d => d.sig as string)
    expect(docs.get("${name:offset}")?.placeholders).toEqual(["name", "offset"])
    expect(docs.get("${name:offset:length}")?.placeholders).toEqual([
      "name",
      "offset",
      "length",
    ])
  })

  test("set-test form ${+name} renders with a leading plus", () => {
    const yo = [
      "sect(Parameter Expansion)",
      "startitem()",
      "item(tt(${PLUS())var(name)tt(}))(1 if set else 0.)",
      "enditem()",
    ].join("\n")
    const doc = only(parseParamExpns(yo))
    expect(doc.sig).toBe(pex("${+name}"))
    expect(doc.subKind).toBe("set-test")
  })

  test("throws on an unrecognized sig (catches upstream drift)", () => {
    const yo = [
      "sect(Parameter Expansion)",
      "startitem()",
      "item(tt(${)var(name)tt(!unknown)var(word)tt(}))(novel form.)",
      "enditem()",
    ].join("\n")
    expect(() => parseParamExpns(yo)).toThrow(/unknown sig/i)
  })

  describe("vendored expn.yo", () => {
    const docs = parseParamExpns(EXPN_YO)
    const bySig = by(docs, d => d.sig as string)

    test("overall shape", () => {
      expectDocCorpus({
        docs,
        minCount: 25,
        keyOf: d => d.sig as string,
        descOf: d => d.desc,
        sectionOf: d => d.section,
        known: [
          "${name}",
          "${+name}",
          "${name:-word}",
          "${name/pattern/repl}",
          "${#spec}",
          "${^^spec}",
        ],
      })
    })

    test.each([
      ["${name}", "plain", ["name"]],
      ["${+name}", "set-test", ["name"]],
      ["${name-word}", "default", ["name", "word"]],
      ["${name:-word}", "default", ["name", "word"]],
      ["${name+word}", "alt", ["name", "word"]],
      ["${name::=word}", "assign", ["name", "word"]],
      ["${name:?word}", "err", ["name", "word"]],
      ["${name##pattern}", "strip-pre", ["name", "pattern"]],
      ["${name%%pattern}", "strip-suf", ["name", "pattern"]],
      ["${name:#pattern}", "exclude", ["name", "pattern"]],
      ["${name:|arrayname}", "array-remove", ["name", "arrayname"]],
      ["${name:*arrayname}", "array-retain", ["name", "arrayname"]],
      ["${name:^^arrayname}", "array-zip", ["name", "arrayname"]],
      ["${name:offset:length}", "substring", ["name", "offset", "length"]],
      ["${name//pattern/repl}", "replace", ["name", "pattern", "repl"]],
      ["${#spec}", "length", ["spec"]],
      ["${^^spec}", "rc-expand", ["spec"]],
      ["${==spec}", "word-split", ["spec"]],
      ["${~~spec}", "glob-subst", ["spec"]],
    ])("%s → %s, placeholders=%j", (sig, subKind, placeholders) => {
      const doc = bySig.get(sig)
      expect(doc, `missing vendored sig ${sig}`).toBeDefined()
      expect(doc?.subKind).toBe(subKind)
      expect(doc?.placeholders).toEqual(placeholders)
    })

    test("grouped sigs share desc and list each other in groupSigs", () => {
      const a = bySig.get("${name/pattern/repl}")
      const b = bySig.get("${name//pattern/repl}")
      const c = bySig.get("${name:/pattern/repl}")
      expect(a?.desc).toBe(b?.desc)
      expect(b?.desc).toBe(c?.desc)
      expect(a?.groupSigs).toEqual([
        "${name/pattern/repl}",
        "${name//pattern/repl}",
        "${name:/pattern/repl}",
      ])
      expect(a?.orderInGroup).toBe(0)
      expect(b?.orderInGroup).toBe(1)
      expect(c?.orderInGroup).toBe(2)
    })

    test("identity is idempotent under mkDocumented('param_expn')", () => {
      for (const d of docs) expect(pex(d.sig)).toBe(d.sig)
    })
  })
})
