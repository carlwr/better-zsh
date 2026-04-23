import { describe, expect, test } from "vitest"
import { parseArithOps } from "../../docs/yodl/extractors/arith-ops"
import { parseJobSpecs } from "../../docs/yodl/extractors/job-specs"
import { parseKeymaps } from "../../docs/yodl/extractors/keymaps"
import { parsePromptEscapes } from "../../docs/yodl/extractors/prompt-escapes"
import {
  parseShellParams,
  parseWidgetParams,
} from "../../docs/yodl/extractors/shell-params"
import { parseSpecialFunctions } from "../../docs/yodl/extractors/special-functions"
import { parseZleWidgets } from "../../docs/yodl/extractors/zle-widgets"
import { by, readVendoredYo } from "./test-util"

describe("parseKeymaps", () => {
  const docs = parseKeymaps(readVendoredYo("zle.yo"))
  const map = by(docs, d => d.name)

  test("covers the eight initial keymaps", () => {
    const names = [...map.keys()].sort()
    expect(names).toEqual(
      [
        "emacs",
        "viins",
        "vicmd",
        "viopp",
        "visual",
        "isearch",
        "command",
        ".safe",
      ].sort(),
    )
  })

  test(".safe is marked special; others are not", () => {
    expect(map.get(".safe" as never)?.isSpecial).toBe(true)
    expect(map.get("emacs" as never)?.isSpecial).toBe(false)
  })

  test("emacs carries `main` link", () => {
    expect(map.get("emacs" as never)?.linkedFrom).toEqual(["main"])
    expect(map.get("viins" as never)?.linkedFrom).toEqual([])
  })
})

describe("parseJobSpecs", () => {
  const docs = parseJobSpecs(readVendoredYo("jobs.yo"))
  const map = by(docs, d => d.key)

  test("covers all six forms with correct kinds", () => {
    expect(map.get("%number" as never)?.kind).toBe("number")
    expect(map.get("%string" as never)?.kind).toBe("string")
    expect(map.get("%?string" as never)?.kind).toBe("contains")
    expect(map.get("%%" as never)?.kind).toBe("current")
    expect(map.get("%+" as never)?.kind).toBe("current")
    expect(map.get("%-" as never)?.kind).toBe("previous")
  })
})

describe("parseArithOps", () => {
  const docs = parseArithOps(readVendoredYo("arith.yo"))
  const map = by(docs, d => d.op)

  test("includes the expected operator families", () => {
    // sanity-check a spread of arities
    expect(map.get("!" as never)?.arity).toBe("unary")
    expect(map.get("~" as never)?.arity).toBe("unary")
    expect(map.get("<<" as never)?.arity).toBe("binary")
    expect(map.get("==" as never)?.arity).toBe("binary")
    expect(map.get("**" as never)?.arity).toBe("binary")
    expect(map.get("?" as never)?.arity).toBe("ternary")
    expect(map.get(":" as never)?.arity).toBe("ternary")
  })

  test("overloaded for `+` and `-`", () => {
    expect(map.get("+" as never)?.arity).toBe("overloaded")
    expect(map.get("-" as never)?.arity).toBe("overloaded")
  })

  test("C_PRECEDENCES table is not also emitted", () => {
    // The native table has 15 rows; per-op dedup yields ~42 records. C_PRECEDENCES
    // adds no new ops and would double-count if we parsed both tables.
    expect(docs.length).toBeLessThan(50)
    expect(docs.length).toBeGreaterThan(30)
  })
})

describe("parseSpecialFunctions", () => {
  const docs = parseSpecialFunctions(readVendoredYo("func.yo"))
  const map = by(docs, d => d.name)

  test("hooks carry `_functions` array names", () => {
    expect(map.get("chpwd" as never)?.hookArray).toBe("chpwd_functions")
    expect(map.get("precmd" as never)?.hookArray).toBe("precmd_functions")
    expect(map.get("zshexit" as never)?.hookArray).toBe("zshexit_functions")
  })

  test("TRAP* literals and template record are separate", () => {
    expect(map.get("TRAPDEBUG" as never)?.kind).toBe("trap-literal")
    expect(map.get("TRAPEXIT" as never)?.kind).toBe("trap-literal")
    expect(map.get("TRAPZERR" as never)?.kind).toBe("trap-literal")
    expect(map.get("TRAPNAL" as never)?.kind).toBe("trap-template")
  })

  test("trap records carry no hookArray", () => {
    expect(map.get("TRAPDEBUG" as never)?.hookArray).toBeUndefined()
    expect(map.get("TRAPNAL" as never)?.hookArray).toBeUndefined()
  })
})

describe("parsePromptEscapes — typed subsection (enrichment)", () => {
  const docs = parsePromptEscapes(readVendoredYo("prompt.yo"))
  const sections = new Set(docs.map(d => d.section))

  test("all records land on a closed-union subsection", () => {
    expect([...sections].sort()).toEqual(
      [
        "Special characters",
        "Login information",
        "Shell state",
        "Date and time",
        "Visual effects",
        "Conditional Substrings in Prompts",
      ].sort(),
    )
  })
})

describe("parseShellParams — typed section (enrichment)", () => {
  const docs = parseShellParams(readVendoredYo("params.yo"))
  test("every record lands on a shell-set or shell-used section", () => {
    for (const d of docs) {
      expect(["shell-set", "shell-used"]).toContain(d.section)
    }
  })
})

describe("parseWidgetParams (ZLE widget-local parameters)", () => {
  const docs = parseWidgetParams(readVendoredYo("zle.yo"))
  const map = by(docs, d => d.name)

  test("includes well-known widget params", () => {
    for (const n of ["BUFFER", "CURSOR", "CONTEXT", "WIDGET", "LBUFFER"]) {
      expect(map.has(n as never)).toBe(true)
    }
  })

  test("all records carry section: zle-widget and no tied pairing", () => {
    for (const d of docs) {
      expect(d.section).toBe("zle-widget")
      expect(d.tied).toBeUndefined()
    }
  })
})

describe("parseZleWidgets — typed subsection (enrichment)", () => {
  const docs = parseZleWidgets(readVendoredYo("zle.yo"))
  const subs = new Set(docs.map(d => d.section))

  test("all subsection values are in the closed union", () => {
    for (const s of subs) {
      expect([
        "Movement",
        "History Control",
        "Modifying Text",
        "Arguments",
        "Completion",
        "Miscellaneous",
        "Text Objects",
        "Special Widgets",
      ]).toContain(s)
    }
  })
})
