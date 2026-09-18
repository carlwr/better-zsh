import { describe, expect, test } from "vitest"
import type { Emulation, OptFlagAlias, OptFlagSign } from "../../docs/types"
import { emulations, mkOptFlag, optSections } from "../../docs/types"
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

// The two single-letter tables: plain zsh + csh emulation, sh + ksh emulation.
const ZSH: readonly Emulation[] = ["csh", "zsh"]
const KSH: readonly Emulation[] = ["ksh", "sh"]
const BOTH: readonly Emulation[] = ["csh", "ksh", "sh", "zsh"]
const alias = (
  char: string,
  on: OptFlagSign,
  emulations: readonly Emulation[],
): OptFlagAlias => ({ char: mkOptFlag(char), on, emulations })

/** `yo` without the `subsect(title)` … up to the next `subsect(` (a whole sitem list). */
function withoutSubsect(yo: string, title: string): string {
  const start = yo.indexOf(`subsect(${title})`)
  const end = yo.indexOf("subsect(", start + 1)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return yo.slice(0, start) + yo.slice(end)
}

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
    expect(o.flags).toEqual([alias("J", "-", ZSH)])
    expect(o.section).toBe("Changing Directories")
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

  // Flags come from three sources: the header (`ksh:` marks the sh/ksh
  // table), the "Default set" list and the "sh/ksh emulation set" list.
  // `-b` and `-f` are header+list; `-T` is list-only; `-e` sits in both
  // tables; `em(NO_)` rows flip the sign.
  test("attributes short flags per emulation table from header and lists", () => {
    const yo = `subsect(Expansion and Globbing)
item(tt(GLOB) (tt(PLUS()F), ksh: tt(PLUS()f)) <D>)(
Perform filename generation.
)
subsect(Job Control)
item(tt(NOTIFY) (tt(-5), ksh: tt(-b)) <Z>)(
Report status of background jobs immediately.
)
subsect(Scripts and Functions)
item(tt(ERR_EXIT) (tt(-e), ksh: tt(-e)))(
If a command has a non-zero exit status, exit.
)
subsect(Shell Emulation)
item(tt(TRAPS_ASYNC))(
Handle signals immediately.
)
sect(Single Letter Options)
subsect(Default set)
startsitem()
sitem(tt(-5))(NOTIFY)
sitem(tt(-F))(em(NO_)GLOB)
sitem(tt(-e))(ERR_EXIT)
endsitem()
subsect(sh/ksh emulation set)
startsitem()
sitem(tt(-T))(TRAPS_ASYNC)
sitem(tt(-b))(NOTIFY)
sitem(tt(-e))(ERR_EXIT)
sitem(tt(-f))(em(NO_)GLOB)
endsitem()`
    const flags = new Map(parseOptions(yo).map(o => [o.display, o.flags]))
    expect(flags).toEqual(
      new Map([
        ["GLOB", [alias("F", "+", ZSH), alias("f", "+", KSH)]],
        ["NOTIFY", [alias("5", "-", ZSH), alias("b", "-", KSH)]],
        ["ERR_EXIT", [alias("e", "-", BOTH)]],
        ["TRAPS_ASYNC", [alias("T", "-", KSH)]],
      ]),
    )
  })

  test("plain-zsh aliases precede sh/ksh-only ones whatever the source order", () => {
    const yo = `subsect(Job Control)
item(tt(FOO) (tt(-1), ksh: tt(-2)))(
Synthetic.
)
subsect(Default set)
startsitem()
sitem(tt(-3))(FOO)
endsitem()`
    expect(only(parseOptions(yo)).flags).toEqual([
      alias("1", "-", ZSH),
      alias("3", "-", ZSH),
      alias("2", "-", KSH),
    ])
  })

  test("throws on an option header of unknown shape", () => {
    const yo = `subsect(Job Control)
item(tt(NOTIFY) (tt(-5), bash: tt(-b)))(
Report status of background jobs immediately.
)`
    expect(() => parseOptions(yo)).toThrow(/Unexpected zsh option header/)
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
        sectionOf: o => o.section,
        known: [opt("AUTO_CD"), opt("EXTENDED_GLOB"), opt("GLOB_DOTS")],
      }))

    // Closed-union check: every observed section is in `optSections` AND
    // every `optSections` value appears (no orphan literals).
    test("section set equals optSections", () => {
      expect([...new Set(opts.map(o => o.section))].sort()).toEqual(
        [...optSections].sort(),
      )
    })

    // Pins the two tables' differing letters (`+f`, `-X`, `-b`, `-T`) and
    // the three source asymmetries: GLOBAL_RCS `+d` is header-only,
    // TRAPS_ASYNC `-T` and RESTRICTED `-r` (as sh/ksh letters) are list-only.
    test.each([
      ["ERR_EXIT", [alias("e", "-", BOTH)]],
      ["RCS", [alias("f", "+", ZSH)]],
      ["GLOB", [alias("F", "+", ZSH), alias("f", "+", KSH)]],
      ["GLOBAL_RCS", [alias("d", "+", ZSH)]],
      ["LIST_TYPES", [alias("X", "-", ZSH)]],
      ["MARK_DIRS", [alias("8", "-", ZSH), alias("X", "-", KSH)]],
      ["NOTIFY", [alias("5", "-", ZSH), alias("b", "-", KSH)]],
      ["CDABLE_VARS", [alias("T", "-", ZSH)]],
      ["TRAPS_ASYNC", [alias("T", "-", KSH)]],
      ["RESTRICTED", [alias("r", "-", BOTH)]],
    ] as const)("short flags of %s", (name, want) => {
      expect(byName.get(opt(name))?.flags).toEqual(want)
    })

    // Per emulation, one letter names one option: `set -X` is LIST_TYPES in
    // plain zsh, MARK_DIRS under sh/ksh — never both in one table.
    test.each(emulations)("letters are unique within the %s table", emu => {
      const owners = new Map<string, string[]>()
      for (const o of opts)
        for (const f of o.flags)
          if (f.emulations.includes(emu))
            owners.set(f.char, [...(owners.get(f.char) ?? []), o.name])
      expect([...owners].filter(([, names]) => names.length > 1)).toEqual([])
    })

    test("every alias is valid in a non-empty, tuple-ordered emulation set", () => {
      for (const o of opts)
        for (const f of o.flags) {
          expect(f.emulations).not.toEqual([])
          expect(f.emulations).toEqual(
            emulations.filter(e => f.emulations.includes(e)),
          )
        }
    })

    // Re-vendor drift catchers: each list agrees with the headers in one
    // direction, so dropping it changes nothing (the reverse does not hold —
    // see the asymmetries pinned above).
    test("the Default set list adds nothing to the headers", () => {
      expect(parseOptions(withoutSubsect(OPTS_YO, "Default set"))).toEqual(opts)
    })

    test("header ksh: markers add nothing to the sh/ksh emulation set list", () => {
      const stripped = OPTS_YO.replace(
        /, ksh: tt\((?:PLUS\(\)|[+-])[A-Za-z0-9]\)/g,
        "",
      )
      expect(stripped).not.toBe(OPTS_YO)
      expect(parseOptions(stripped)).toEqual(opts)
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
      expect(rec?.section).toBe("Option Aliases")
      expect(rec?.aliasOf).toEqual({ target: opt(target), negated })
    })

    test("non-alias options have no aliasOf", () => {
      expect(byName.get(opt("AUTO_CD"))?.aliasOf).toBeUndefined()
    })
  })
})
