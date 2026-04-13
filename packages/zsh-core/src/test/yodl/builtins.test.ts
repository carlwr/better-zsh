import { describe, expect, test } from "vitest"
import { mkBuiltinName } from "../../types/brand"
import { parseBuiltins } from "../../yodl/docs/builtins"
import { by, only, readVendoredYo } from "./test-util"

const BUILTINS_YO = readVendoredYo("builtins.yo")

describe("parseBuiltins", () => {
  test("parses regular builtin item", () => {
    const yo = `startitem()
findex(echo)
item(tt(echo) [ tt(-n) ])(
Write text.
)
enditem()`
    const doc = only(parseBuiltins(yo))
    expect(doc.name).toBe(mkBuiltinName("echo"))
    expect(doc.synopsis).toEqual(["echo [ -n ]"])
    expect(doc.synopsis).toHaveLength(1)
    expect(doc.desc).toBe("Write text.")
  })

  test("parses alias and module macro invocations", () => {
    const yo = `startitem()
alias(bye)(exit)
module(zstyle)(zsh/zutil)
enditem()`
    const docs = parseBuiltins(yo)
    expect(docs.map((d) => d.name)).toEqual([
      mkBuiltinName("bye"),
      mkBuiltinName("zstyle"),
    ])
    expect(docs[0]?.aliasOf).toBe(mkBuiltinName("exit"))
    expect(docs[1]?.module).toBe("zsh/zutil")
  })

  test("attaches continuation xitems to each synopsis head", () => {
    const yo = `startitem()
xitem(tt(foo) [ var(one) ])
xitem(SPACES()[ var(two) ])
item(tt(bar) [ var(three) ])(
Shared description.
)
enditem()`
    const docs = parseBuiltins(yo)
    expect(docs).toEqual([
      {
        name: mkBuiltinName("foo"),
        synopsis: ["foo [ one ]", "[ two ]"],
        desc: "Shared description.",
      },
      {
        name: mkBuiltinName("bar"),
        synopsis: ["bar [ three ]", "[ two ]"],
        desc: "Shared description.",
      },
    ])
  })

  describe("vendored builtins.yo", () => {
    const docs = parseBuiltins(BUILTINS_YO)
    const byName = by(docs, (d) => d.name)

    test("parses xitem aliases for test and [", () => {
      expect(byName.get(mkBuiltinName("test"))?.synopsis[0]).toBe(
        "test [ arg ... ]",
      )
      expect(byName.get(mkBuiltinName("["))?.synopsis[0]).toBe(
        "[ [ arg ... ] ]",
      )
    })

    test("all builtins keep non-empty synopsis", () => {
      for (const doc of docs) expect(doc.synopsis.length).toBeGreaterThan(0)
    })

    test("excludes macro template placeholders", () => {
      expect(docs.some((d) => d.name === mkBuiltinName("ARG1"))).toBe(false)
    })

    test("includes macro-defined builtins", () => {
      const names = new Set(docs.map((d) => d.name))
      expect(names.has(mkBuiltinName("bindkey"))).toBe(true)
      expect(names.has(mkBuiltinName("compctl"))).toBe(true)
      expect(names.has(mkBuiltinName("zstyle"))).toBe(true)
    })

    test("descriptions strip index macros and raw yodl", () => {
      for (const doc of docs) {
        expect(doc.desc).not.toContain("vindex(")
        expect(doc.desc).not.toContain("tt(")
        expect(doc.desc).not.toContain("var(")
        expect(doc.desc).not.toContain("startsitem(")
        expect(doc.desc).not.toContain("sitem(")
        expect(doc.desc).not.toContain("\u0007")
      }
    })
  })
})
