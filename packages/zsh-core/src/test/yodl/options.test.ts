import { describe, expect, test } from "vitest"
import { mkOptFlagChar, mkProven, optSections } from "../../docs/types"
import { parseOptions } from "../../docs/yodl/extractors/options"
import { by, only, readVendoredYo } from "./test-util"

const OPTS_YO = readVendoredYo("options.yo")

describe("parseOptions", () => {
  test("parses AUTO_CD", () => {
    const yo = `subsect(Changing Directories)
item(tt(AUTO_CD) (tt(-J)))(
If a command is issued that can't be executed as a normal command,
and the command is the name of a directory, perform the cd
command to that directory.
)`
    const opt = only(parseOptions(yo))
    expect(opt.name).toBe(mkProven("option", "AUTO_CD"))
    expect(opt.display).toBe("AUTO_CD")
    expect(opt.flags).toEqual([{ char: mkOptFlagChar("J"), on: "-" }])
    expect(opt.category).toBe("Changing Directories")
    expect(opt.desc).toContain("command is the name of a directory")
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
      { char: mkOptFlagChar("5"), on: "-" },
      { char: mkOptFlagChar("b"), on: "-" },
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
        expect(mkProven("option", o.name)).toBe(o.name)
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
      expect(byName.has(mkProven("option", "EXTENDED_GLOB"))).toBe(true)
      expect(byName.has(mkProven("option", "AUTO_CD"))).toBe(true)
      expect(byName.has(mkProven("option", "GLOB_DOTS"))).toBe(true)
    })

    test("captures short-flag polarity from vendored docs", () => {
      expect(byName.get(mkProven("option", "ERR_EXIT"))?.flags).toEqual([
        { char: mkOptFlagChar("e"), on: "-" },
      ])
      expect(byName.get(mkProven("option", "RCS"))?.flags).toEqual([
        { char: mkOptFlagChar("f"), on: "+" },
      ])
      expect(byName.get(mkProven("option", "GLOBAL_RCS"))?.flags).toEqual([
        { char: mkOptFlagChar("d"), on: "+" },
      ])
      expect(byName.get(mkProven("option", "MARK_DIRS"))?.flags).toEqual([
        { char: mkOptFlagChar("8"), on: "-" },
        { char: mkOptFlagChar("X"), on: "-" },
      ])
      expect(byName.get(mkProven("option", "NOTIFY"))?.flags).toEqual([
        { char: mkOptFlagChar("5"), on: "-" },
        { char: mkOptFlagChar("b"), on: "-" },
      ])
    })

    test("keeps known one-to-many short flags explicit", () => {
      const byFlag = new Map<string, string[]>()
      for (const opt of opts) {
        for (const flag of opt.flags) {
          const key = `${flag.on}${flag.char}`
          byFlag.set(key, [...(byFlag.get(key) ?? []), opt.name])
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
  })
})
