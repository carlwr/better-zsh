import { describe, expect, test } from "vitest"
import { mkOptFlag, optSections } from "../../docs/types"
import { parseOptions } from "../../docs/yodl/extractors/options"
import { mkDocumented_ } from "../id-fns"
import { by, only, readVendoredYo } from "./test-util"

const OPTS_YO = readVendoredYo("options.yo")
const opt = mkDocumented_("option")

describe("parseOptions", () => {
  test("parses AUTO_CD", () => {
    const yo = `subsect(Changing Directories)
item(tt(AUTO_CD) (tt(-J)))(
If a command is issued that can't be executed as a normal command,
and the command is the name of a directory, perform the cd
command to that directory.
)`
    const o = only(parseOptions(yo))
    expect(o.name).toBe(opt("AUTO_CD"))
    expect(o.display).toBe("AUTO_CD")
    expect(o.flags).toEqual([{ char: mkOptFlag("J"), on: "-" }])
    expect(o.category).toBe("Changing Directories")
    expect(o.desc).toContain("command is the name of a directory")
  })

  test("parses option with default marker", () => {
    const yo = `subsect(Completion)
item(tt(AUTO_LIST) (tt(-9)) <D>)(
Automatically list choices on an ambiguous completion.
)`
    expect(only(parseOptions(yo)).defaultIn).toEqual([
      "csh",
      "ksh",
      "sh",
      "zsh",
    ])
  })

  test("parses option without letter", () => {
    const yo = `subsect(Completion)
item(tt(BASH_AUTO_LIST))(
On an ambiguous completion, list choices when the completion
function is called for the second time in a row.
)`
    expect(only(parseOptions(yo)).flags).toEqual([])
  })

  test("parses option with multiple default markers", () => {
    const yo = `subsect(Input/Output)
item(tt(POSIX_CD) <K> <S>)(
Make cd and pushd behave POSIX-like.
)`
    expect(only(parseOptions(yo)).defaultIn).toEqual(["ksh", "sh"])
  })

  test("keeps distinct short flags from header and default-set aliases", () => {
    const yo = `subsect(Job Control)
item(tt(NOTIFY) (tt(-5), ksh: tt(-b)) <Z>)(
Report status of background jobs immediately.
)
subsect(Default set)
startsitem()
sitem(tt(-5))(NOTIFY)
endsitem()`
    expect(only(parseOptions(yo)).flags).toEqual([
      { char: mkOptFlag("5"), on: "-" },
      { char: mkOptFlag("b"), on: "-" },
    ])
  })

  describe("vendored options.yo", () => {
    const opts = parseOptions(OPTS_YO)
    const byName = by(opts, o => o.name)

    test("parses a non-trivial number of options", () => {
      expect(opts.length).toBeGreaterThan(100)
    })

    test("all options have non-empty name and desc", () => {
      for (const o of opts) {
        expect(o.name).toBeTruthy()
        expect(o.desc).toBeTruthy()
      }
    })

    test("all names pass mkProven option idempotence", () => {
      for (const o of opts) {
        expect(opt(o.name)).toBe(o.name)
      }
    })

    test("no duplicate names", () => {
      const names = opts.map(o => o.name)
      expect(new Set(names).size).toBe(names.length)
    })

    test("all categories are non-empty", () => {
      expect([...new Set(opts.map(o => o.category))]).toEqual(optSections)
    })

    test("known options exist", () => {
      expect(byName.has(opt("EXTENDED_GLOB"))).toBe(true)
      expect(byName.has(opt("AUTO_CD"))).toBe(true)
      expect(byName.has(opt("GLOB_DOTS"))).toBe(true)
    })

    test("captures short-flag polarity from vendored docs", () => {
      expect(byName.get(opt("ERR_EXIT"))?.flags).toEqual([
        { char: mkOptFlag("e"), on: "-" },
      ])
      expect(byName.get(opt("RCS"))?.flags).toEqual([
        { char: mkOptFlag("f"), on: "+" },
      ])
      expect(byName.get(opt("GLOBAL_RCS"))?.flags).toEqual([
        { char: mkOptFlag("d"), on: "+" },
      ])
      expect(byName.get(opt("MARK_DIRS"))?.flags).toEqual([
        { char: mkOptFlag("8"), on: "-" },
        { char: mkOptFlag("X"), on: "-" },
      ])
      expect(byName.get(opt("NOTIFY"))?.flags).toEqual([
        { char: mkOptFlag("5"), on: "-" },
        { char: mkOptFlag("b"), on: "-" },
      ])
    })

    test("keeps known one-to-many short flags explicit", () => {
      const byFlag = new Map<string, string[]>()
      for (const o of opts) {
        for (const flag of o.flags) {
          const key = `${flag.on}${flag.char}`
          byFlag.set(key, [...(byFlag.get(key) ?? []), o.name])
        }
      }
      expect(byFlag.get("-X")).toEqual(["listtypes", "markdirs"])
      expect(byFlag.get("+f")).toEqual(["glob", "rcs"])
    })

    test("descriptions strip raw yodl macros", () => {
      for (const o of opts) {
        expect(o.desc).not.toContain("example(")
        expect(o.desc).not.toContain("manref(")
      }
    })

    test("option-alias records carry aliasOf with normalized target + negation", () => {
      const map = by(opts, o => o.name)
      // BRACE_EXPAND aliases `em(NO_)IGNORE_BRACES` — negated alias.
      const brace = map.get(opt("BRACE_EXPAND"))
      expect(brace?.category).toBe("Option Aliases")
      expect(brace?.aliasOf).toEqual({
        target: opt("IGNORE_BRACES"),
        negated: true,
      })
      // DOT_GLOB aliases `tt(GLOB_DOTS)` — non-negated.
      const dot = map.get(opt("DOT_GLOB"))
      expect(dot?.aliasOf).toEqual({
        target: opt("GLOB_DOTS"),
        negated: false,
      })
    })

    test("non-alias options have no aliasOf", () => {
      const map = by(opts, o => o.name)
      expect(map.get(opt("AUTO_CD"))?.aliasOf).toBeUndefined()
    })
  })
})
