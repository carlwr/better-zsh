import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { mkBuiltinName } from "../types/brand"
import { parseBuiltins } from "../yodl/builtins"

const BUILTINS_YO = readFileSync(
  resolve(__dirname, "../data/zsh-docs/builtins.yo"),
  "utf8",
)

describe("parseBuiltins", () => {
  test("parses regular builtin item", () => {
    const yo = `startitem()
findex(echo)
item(tt(echo) [ tt(-n) ])(
Write text.
)
enditem()`
    const docs = parseBuiltins(yo)
    expect(docs).toHaveLength(1)
    expect(docs[0]?.name).toBe(mkBuiltinName("echo"))
    expect(docs[0]?.synopsis).toEqual(["echo [ -n ]"])
    expect(docs[0]?.desc).toBe("Write text.")
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

  test("parses xitem aliases for test and [", () => {
    const doc = parseBuiltins(BUILTINS_YO)
    const byName = new Map(doc.map((d) => [d.name, d]))
    expect(byName.get(mkBuiltinName("test"))?.synopsis[0]).toBe(
      "test [ arg ... ]",
    )
    expect(byName.get(mkBuiltinName("["))?.synopsis[0]).toBe("[ [ arg ... ] ]")
  })

  test("vendored file excludes macro template placeholders", () => {
    const docs = parseBuiltins(BUILTINS_YO)
    expect(docs.some((d) => d.name === mkBuiltinName("ARG1"))).toBe(false)
  })

  test("vendored file includes macro-defined builtins", () => {
    const docs = parseBuiltins(BUILTINS_YO)
    const names = new Set(docs.map((d) => d.name))
    expect(names.has(mkBuiltinName("bindkey"))).toBe(true)
    expect(names.has(mkBuiltinName("compctl"))).toBe(true)
    expect(names.has(mkBuiltinName("zstyle"))).toBe(true)
  })

  test("vendored descriptions strip index macros and raw yodl", () => {
    const docs = parseBuiltins(BUILTINS_YO)
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
