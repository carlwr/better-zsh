import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { mkOptFlag } from "../docs/types"
import { mkCandidate_, mkProven_ } from "./id-fns"

const opt = mkProven_("option")
const cond = mkProven_("cond_op")
const optC = mkCandidate_("option")

describe("mkProven option (normalizes like mkOptName)", () => {
  test("normalizes known equivalences", () => {
    expect(opt("EXTENDED_GLOB")).toBe(opt("extendedglob"))
    expect(opt("EXTENDED_GLOB")).toBe(opt("extended_glob"))
    expect(opt("AUTO_CD")).toBe(opt("autocd"))
  })

  test("is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        expect(opt(opt(s))).toBe(opt(s))
      }),
    )
  })

  test("result is lowercase, no underscores", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        const r = opt(s)
        expect(r).toBe(r.toLowerCase())
        expect(r).not.toContain("_")
      }),
    )
  })
})

describe("mkProven cond_op (trims)", () => {
  test("trims whitespace", () => {
    expect(cond("  -a  ")).toBe(cond("-a"))
  })

  test("preserves non-whitespace", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        expect(cond(s) as string).toBe(s.trim())
      }),
    )
  })
})

describe("mkOptFlag", () => {
  test("trims whitespace", () => {
    expect(mkOptFlag(" J ")).toBe(mkOptFlag("J"))
  })
})

describe("mkCandidate option", () => {
  test("strips no_ prefix", () => {
    expect(optC("no_autocd") as string).toBe("autocd")
    expect(optC("NO_AUTO_CD") as string).toBe("autocd")
  })

  test("strips no prefix (no underscore)", () => {
    expect(optC("noautocd") as string).toBe("autocd")
  })

  test("normalizes like mkProven option for non-negated forms", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        expect(optC(s) as string).toBe(opt(s.replace(/^no_?/i, "")) as string)
      }),
    )
  })

  test("mkProven option does NOT strip no_", () => {
    expect(opt("no_autocd") as string).toBe("noautocd")
    expect(optC("no_autocd") as string).toBe("autocd")
  })
})
