import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { mkOptFlagChar, mkOptName } from "../../types/brand"
import { parseOptions } from "../../yodl/docs/options"

const OPTS_YO = readFileSync(
  resolve(__dirname, "../../data/zsh-docs/options.yo"),
  "utf8",
)

describe("parseOptions", () => {
  test("parses AUTO_CD", () => {
    const yo = `subsect(Changing Directories)
item(tt(AUTO_CD) (tt(-J)))(
If a command is issued that can't be executed as a normal command,
and the command is the name of a directory, perform the cd
command to that directory.
)`
    const opts = parseOptions(yo)
    expect(opts).toHaveLength(1)
    expect(opts[0]?.name).toBe(mkOptName("AUTO_CD"))
    expect(opts[0]?.display).toBe("AUTO_CD")
    expect(opts[0]?.flags).toEqual([{ char: mkOptFlagChar("J"), on: "-" }])
    expect(opts[0]?.category).toBe("Changing Directories")
    expect(opts[0]?.desc).toContain("command is the name of a directory")
  })

  test("parses option with default marker", () => {
    const yo = `subsect(Completion)
item(tt(AUTO_LIST) (tt(-9)) <D>)(
Automatically list choices on an ambiguous completion.
)`
    const opts = parseOptions(yo)
    expect(opts).toHaveLength(1)
    expect(opts[0]?.defaultIn).toEqual(["csh", "ksh", "sh", "zsh"])
  })

  test("parses option without letter", () => {
    const yo = `subsect(Completion)
item(tt(BASH_AUTO_LIST))(
On an ambiguous completion, list choices when the completion
function is called for the second time in a row.
)`
    const opts = parseOptions(yo)
    expect(opts).toHaveLength(1)
    expect(opts[0]?.flags).toEqual([])
  })

  test("parses option with multiple default markers", () => {
    const yo = `subsect(Input/Output)
item(tt(POSIX_CD) <K> <S>)(
Make cd and pushd behave POSIX-like.
)`
    const opts = parseOptions(yo)
    expect(opts).toHaveLength(1)
    expect(opts[0]?.defaultIn).toEqual(["ksh", "sh"])
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
    const opts = parseOptions(yo)
    expect(opts).toHaveLength(1)
    expect(opts[0]?.flags).toEqual([
      { char: mkOptFlagChar("5"), on: "-" },
      { char: mkOptFlagChar("b"), on: "-" },
    ])
  })

  describe("vendored options.yo", () => {
    const opts = parseOptions(OPTS_YO)
    const byName = new Map(opts.map((o) => [o.name, o]))

    test("parses a non-trivial number of options", () => {
      expect(opts.length).toBeGreaterThan(100)
    })

    test("all options have non-empty name and desc", () => {
      for (const o of opts) {
        expect(o.name).toBeTruthy()
        expect(o.desc).toBeTruthy()
      }
    })

    test("all names pass mkOptName idempotence", () => {
      for (const o of opts) {
        expect(mkOptName(o.name)).toBe(o.name)
      }
    })

    test("no duplicate names", () => {
      const names = opts.map((o) => o.name)
      expect(new Set(names).size).toBe(names.length)
    })

    test("all categories are non-empty", () => {
      for (const o of opts) {
        expect(o.category).toBeTruthy()
      }
    })

    test("known options exist", () => {
      expect(byName.has(mkOptName("EXTENDED_GLOB"))).toBe(true)
      expect(byName.has(mkOptName("AUTO_CD"))).toBe(true)
      expect(byName.has(mkOptName("GLOB_DOTS"))).toBe(true)
    })

    test("captures short-flag polarity from vendored docs", () => {
      expect(byName.get(mkOptName("ERR_EXIT"))?.flags).toEqual([
        { char: mkOptFlagChar("e"), on: "-" },
      ])
      expect(byName.get(mkOptName("RCS"))?.flags).toEqual([
        { char: mkOptFlagChar("f"), on: "+" },
      ])
      expect(byName.get(mkOptName("GLOBAL_RCS"))?.flags).toEqual([
        { char: mkOptFlagChar("d"), on: "+" },
      ])
      expect(byName.get(mkOptName("MARK_DIRS"))?.flags).toEqual([
        { char: mkOptFlagChar("8"), on: "-" },
        { char: mkOptFlagChar("X"), on: "-" },
      ])
      expect(byName.get(mkOptName("NOTIFY"))?.flags).toEqual([
        { char: mkOptFlagChar("5"), on: "-" },
        { char: mkOptFlagChar("b"), on: "-" },
      ])
    })

    test("descriptions strip raw yodl macros", () => {
      for (const o of opts) {
        expect(o.desc).not.toContain("example(")
        expect(o.desc).not.toContain("manref(")
      }
    })
  })
})
