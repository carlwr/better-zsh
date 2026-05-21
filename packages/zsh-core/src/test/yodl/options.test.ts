import { describe, expect, test } from "vitest"
import { mkOptFlag, optSections } from "../../docs/types"
import { parseOptions } from "../../docs/yodl/extractors/options"
import { mkDocumented_ } from "../id-fns"
import {
  by,
  expectDocCorpus,
  expectNoYodlLeaks,
  only,
  readVendoredYo,
} from "./test-util"

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

    test("corpus parses", () =>
      expectDocCorpus({
        docs: opts,
        minCount: 100,
        keyOf: o => o.name,
        descOf: o => o.desc,
        sectionOf: o => o.category,
        known: [opt("AUTO_CD"), opt("EXTENDED_GLOB"), opt("GLOB_DOTS")],
      }))

    // Closed-union check: every observed category is in `optSections` AND
    // every `optSections` value appears (no orphan literals).
    test("category set equals optSections", () => {
      expect([...new Set(opts.map(o => o.category))].sort()).toEqual(
        [...optSections].sort(),
      )
    })

    test.each([
      ["ERR_EXIT", [["e", "-"]]],
      ["RCS", [["f", "+"]]],
      ["GLOBAL_RCS", [["d", "+"]]],
      [
        "MARK_DIRS",
        [
          ["8", "-"],
          ["X", "-"],
        ],
      ],
      [
        "NOTIFY",
        [
          ["5", "-"],
          ["b", "-"],
        ],
      ],
    ] as const)("short-flag polarity: %s", (name, want) => {
      expect(byName.get(opt(name))?.flags).toEqual(
        want.map(([char, on]) => ({ char: mkOptFlag(char), on })),
      )
    })

    // Two long options share one short flag (`-X` for listtypes+markdirs,
    // `+f` for glob+rcs); the extractor must preserve both, not dedupe.
    test("known one-to-many short flags stay explicit", () => {
      const byFlag = new Map<string, string[]>()
      for (const o of opts)
        for (const f of o.flags) {
          const key = `${f.on}${f.char}`
          byFlag.set(key, [...(byFlag.get(key) ?? []), o.name])
        }
      expect(byFlag.get("-X")).toEqual(["listtypes", "markdirs"])
      expect(byFlag.get("+f")).toEqual(["glob", "rcs"])
    })

    test("descriptions strip raw yodl macros", () => {
      for (const o of opts) expectNoYodlLeaks(o.desc)
    })

    // BRACE_EXPAND aliases `em(NO_)IGNORE_BRACES` — negated.
    // DOT_GLOB aliases `tt(GLOB_DOTS)` — non-negated.
    test.each([
      ["BRACE_EXPAND", "IGNORE_BRACES", true],
      ["DOT_GLOB", "GLOB_DOTS", false],
    ] as const)("alias %s → %s (negated=%s)", (name, target, negated) => {
      const rec = byName.get(opt(name))
      expect(rec?.category).toBe("Option Aliases")
      expect(rec?.aliasOf).toEqual({ target: opt(target), negated })
    })

    test("non-alias options have no aliasOf", () => {
      expect(byName.get(opt("AUTO_CD"))?.aliasOf).toBeUndefined()
    })
  })
})
