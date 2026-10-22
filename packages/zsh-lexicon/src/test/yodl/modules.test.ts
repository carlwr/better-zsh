import { describe, expect, test } from "vitest"
import { parseModuleName } from "../../docs/taxonomy"
import {
  parseModuleBuiltins,
  parseModuleByRegions,
  parseModuleCondOps,
  parseModuleParams,
} from "../../docs/yodl/extractors/modules/helpers"
import { mkDocumented_ } from "../id-fns"
import { only } from "./test-util"

const bi = mkDocumented_("builtin")
const sp = mkDocumented_("special_param")
const co = mkDocumented_("conditional_op")

describe("parseModuleName", () => {
  test("accepts canonical names", () => {
    expect(parseModuleName("zsh/attr")).toBe("zsh/attr")
    expect(parseModuleName("zsh/db/gdbm")).toBe("zsh/db/gdbm")
    expect(parseModuleName("zsh/param/private")).toBe("zsh/param/private")
  })
  test("rejects unknown names", () => {
    expect(parseModuleName("zsh/bogus")).toBeUndefined()
    expect(parseModuleName("attr")).toBeUndefined()
    expect(parseModuleName("")).toBeUndefined()
  })
})

describe("parseModuleBuiltins", () => {
  test("tags every record with `module`", () => {
    const yo = `startitem()
findex(foo)
item(tt(foo) [ var(arg) ])(
Foo command.
)
findex(bar)
item(tt(bar))(
Bar command.
)
enditem()`
    const docs = parseModuleBuiltins(yo, "zsh/attr")
    expect(docs.map(d => d.id)).toEqual([bi("foo"), bi("bar")])
    for (const d of docs) expect(d.module).toBe("zsh/attr")
  })

  test("folds multi-form (xitem+item) into one record with all synopses", () => {
    // The zstyle/zformat/strftime fix: aliased forms whose names match
    // collapse into ONE record with every form as a synopsis line.
    const yo = `startitem()
findex(strftime)
xitem(tt(strftime) [ tt(-s) var(scalar) ] var(format))
item(tt(strftime) tt(-r) [ var(scalar) ])(
Format dates.
)
enditem()`
    const doc = only(parseModuleBuiltins(yo, "zsh/datetime"))
    expect(doc.id).toBe(bi("strftime"))
    expect(doc.synopsis).toHaveLength(2)
    expect(doc.synopsis[0]).toContain("strftime [")
    expect(doc.synopsis[1]).toContain("strftime -r")
  })

  test("expands `<name> ...` abbreviated head from sibling's full sig (mod_stat.yo)", () => {
    // mod_stat.yo writes `item(tt(stat) var(...))(body)` after the full
    // `xitem(tt(zstat ...) ...)` head. `var(...)` renders as the literal
    // three dots, leaving `stat`'s sig as the bare `stat ...`. The
    // abbreviated head must inherit `zstat`'s longer sig with the leading
    // token swapped to `stat`.
    const yo = `startitem()
findex(zstat)
findex(stat)
xitem(tt(zstat) [ tt(-gnNol) ] [ tt(-f) var(fd) ])
xitem(SPACES()[ tt(PLUS())var(element) ] [ var(file) ... ])
item(tt(stat) var(...))(
Shared body.
)
enditem()`
    const docs = parseModuleBuiltins(yo, "zsh/stat")
    const stat = docs.find(d => d.id === bi("stat"))
    const zstat = docs.find(d => d.id === bi("zstat"))
    expect(zstat?.synopsis[0]).toBe("zstat [ -gnNol ] [ -f fd ]")
    expect(stat?.synopsis[0]).toBe("stat [ -gnNol ] [ -f fd ]")
    // Continuation lines still apply to both.
    expect(stat?.synopsis[1]).toContain("[ +element ]")
  })

  test("emits separate records when aliased headers have different names", () => {
    const yo = `startitem()
findex(comptags)
findex(comptry)
xitem(tt(comptags) [ var(args) ])
item(tt(comptry) [ var(args) ])(
Shared body.
)
enditem()`
    const docs = parseModuleBuiltins(yo, "zsh/computil")
    expect(docs.map(d => d.id).sort()).toEqual(
      [bi("comptags"), bi("comptry")].sort(),
    )
    for (const d of docs) expect(d.desc).toBe("Shared body.")
  })
})

describe("parseModuleParams — composite headers", () => {
  test("WATCHFMT-style key sig preserves full header text (not just first tt)", () => {
    // Regression test for first-tt-only bug — the rendered key sig must include
    // the `{color}` placeholder and the `(%f)` stop annotation, not just `%F{`.
    const yo = `startitem()
vindex(WATCHFMT)
item(tt(WATCHFMT))(
Recognizes the following escape sequences:

startitem()
item(tt(%F{)var(color)tt(}) LPAR()tt(%f)RPAR())(
Start (stop) foreground color.
)
xitem(tt(%t))
item(tt(%@))(
The time, in 12-hour, am/pm format.
)
item(tt(%S) LPAR()tt(%s)RPAR())(
Start (stop) standout.
)
enditem()
)
enditem()`
    const doc = only(parseModuleParams(yo, "zsh/watch"))
    expect(doc.id).toBe(sp("WATCHFMT"))
    expect(doc.keys).toBeDefined()
    expect(doc.keys?.map(k => k.sigs)).toEqual([
      ["%F{color} (%f)"],
      ["%t", "%@"],
      ["%S (%s)"],
    ])
  })

  test("captures nested key list (compstate.context-style)", () => {
    const yo = `startitem()
vindex(stuff)
item(tt(stuff))(
Intro prose.

startitem()
item(tt(alpha))(
First key.
)
item(tt(beta))(
Second key.
)
enditem()
)
enditem()`
    const doc = only(parseModuleParams(yo, "zsh/parameter"))
    expect(doc.desc).toContain("Intro")
    expect(doc.keys?.map(k => k.sigs)).toEqual([["alpha"], ["beta"]])
  })
})

describe("parseModuleByRegions", () => {
  test("splits multiple top-level item regions by category", () => {
    const yo = `Builtins:
startitem()
findex(echotc)
item(tt(echotc) var(cap))(
echo capability.
)
enditem()

Parameters:
startitem()
vindex(termcap)
item(tt(termcap))(
Termcap data.
)
enditem()`
    const out = parseModuleByRegions(yo, "zsh/termcap", [
      { kind: "builtins" },
      { kind: "params", scope: "shell-set" },
    ])
    expect(out.builtins.map(d => d.id)).toEqual([bi("echotc")])
    expect(out.params.map(d => d.id)).toEqual([sp("termcap")])
    expect(out.condOps).toEqual([])
    expect(out.builtins[0]?.module).toBe("zsh/termcap")
    expect(out.params[0]?.module).toBe("zsh/termcap")
  })

  test("tolerates missing regions", () => {
    const yo = `startitem()
findex(foo)
item(tt(foo))(Single region.)
enditem()`
    const out = parseModuleByRegions(yo, "zsh/attr", [
      { kind: "builtins" },
      { kind: "params", scope: "shell-set" },
    ])
    expect(out.builtins).toHaveLength(1)
    expect(out.params).toEqual([])
  })
})

describe("parseModuleCondOps", () => {
  test("parses unary cond op with module tag", () => {
    const yo = `startitem()
findex(pcre-match)
item(var(expr) tt(-pcre-match) var(pcre))(
Match against PCRE.
)
enditem()`
    const op = only(parseModuleCondOps(yo, "zsh/pcre"))
    expect(op.id).toBe(co("-pcre-match"))
    expect(op.subKind).toBe("binary")
    expect(op.module).toBe("zsh/pcre")
  })
})
