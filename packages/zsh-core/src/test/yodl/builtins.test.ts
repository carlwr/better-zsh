import { beforeAll, describe, expect, test } from "vitest"
import {
  MODULES_WITH_REAL_RECORDS,
  parseBuiltins,
} from "../../docs/yodl/extractors/builtins"
import { mkDocumented_ } from "../id-fns"
import { by, expectNoYodlLeaks, only, readVendoredYo } from "./test-util"

const BUILTINS_YO = readVendoredYo("builtins.yo")
const bi = mkDocumented_("builtin")

describe("parseBuiltins", () => {
  test("parses regular builtin item", () => {
    const yo = `startitem()
findex(echo)
item(tt(echo) [ tt(-n) ])(
Write text.
)
enditem()`
    const doc = only(parseBuiltins(yo))
    expect(doc.name).toBe(bi("echo"))
    expect(doc.synopsis).toEqual(["echo [ -n ]"])
    expect(doc.synopsis).toHaveLength(1)
    expect(doc.desc).toBe("Write text.")
  })

  // Tests below depend on `zsh/zftp` NOT being in `MODULES_WITH_REAL_RECORDS`,
  // so the `module(zftp)(zsh/zftp)` stub in builtins.yo is kept (not displaced
  // by a richer per-module extractor). Fail loud if upstream landscape shifts.
  beforeAll(() => {
    expect(MODULES_WITH_REAL_RECORDS.has("zsh/zftp")).toBe(false)
  })

  test("parses alias and module macro invocations", () => {
    const yo = `startitem()
alias(bye)(exit)
module(zftp)(zsh/zftp)
enditem()`
    const docs = parseBuiltins(yo)
    expect(docs.map(d => d.name)).toEqual([bi("bye"), bi("zftp")])
    expect(docs[0]?.aliasOf).toBe(bi("exit"))
    expect(docs[1]?.module).toBe("zsh/zftp")
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
        name: bi("foo"),
        synopsis: ["foo [ one ]", "[ two ]"],
        desc: "Shared description.",
      },
      {
        name: bi("bar"),
        synopsis: ["bar [ three ]", "[ two ]"],
        desc: "Shared description.",
      },
    ])
  })

  describe("vendored builtins.yo", () => {
    const docs = parseBuiltins(BUILTINS_YO)
    const byName = by(docs, d => d.name)

    test("parses xitem aliases for test and [", () => {
      expect(byName.get(bi("test"))?.synopsis[0]).toBe("test [ arg ... ]")
      expect(byName.get(bi("["))?.synopsis[0]).toBe("[ [ arg ... ] ]")
    })

    test("all builtins keep non-empty synopsis", () => {
      for (const doc of docs) expect(doc.synopsis.length).toBeGreaterThan(0)
    })

    test("excludes macro template placeholders", () => {
      expect(docs.some(d => d.name === bi("ARG1"))).toBe(false)
    })

    test("includes macro-defined builtins", () => {
      const names = new Set(docs.map(d => d.name))
      // bindkey — from zlecmd() macro; always present regardless of module displacement
      expect(names.has(bi("bindkey"))).toBe(true)
      // zftp — from module(zftp)(zsh/zftp) stub (assumption asserted in beforeAll)
      expect(names.has(bi("zftp"))).toBe(true)
      // displaced modules are NOT present (zstyle, compctl etc. come from their module extractors)
      expect(names.has(bi("zstyle"))).toBe(false)
    })

    test("descriptions strip index macros and raw yodl", () => {
      for (const doc of docs) expectNoYodlLeaks(doc.desc)
    })
  })
})
