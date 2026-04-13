import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { mkCandidate, mkOptFlagChar, mkProven } from "../docs/types"

describe("mkProven option (normalizes like mkOptName)", () => {
  test("normalizes known equivalences", () => {
    expect(mkProven("option", "EXTENDED_GLOB")).toBe(
      mkProven("option", "extendedglob"),
    )
    expect(mkProven("option", "EXTENDED_GLOB")).toBe(
      mkProven("option", "extended_glob"),
    )
    expect(mkProven("option", "AUTO_CD")).toBe(mkProven("option", "autocd"))
  })

  test("is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        expect(mkProven("option", mkProven("option", s))).toBe(
          mkProven("option", s),
        )
      }),
    )
  })

  test("result is lowercase, no underscores", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        const r = mkProven("option", s)
        expect(r).toBe(r.toLowerCase())
        expect(r).not.toContain("_")
      }),
    )
  })
})

describe("mkProven cond_op (trims)", () => {
  test("trims whitespace", () => {
    expect(mkProven("cond_op", "  -a  ")).toBe(mkProven("cond_op", "-a"))
  })

  test("preserves non-whitespace", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        expect(mkProven("cond_op", s) as string).toBe(s.trim())
      }),
    )
  })
})

describe("mkOptFlagChar", () => {
  test("trims whitespace", () => {
    expect(mkOptFlagChar(" J ")).toBe(mkOptFlagChar("J"))
  })
})

describe("mkCandidate option", () => {
  test("strips no_ prefix", () => {
    expect(mkCandidate("option", "no_autocd") as string).toBe("autocd")
    expect(mkCandidate("option", "NO_AUTO_CD") as string).toBe("autocd")
  })

  test("strips no prefix (no underscore)", () => {
    expect(mkCandidate("option", "noautocd") as string).toBe("autocd")
  })

  test("normalizes like mkProven option for non-negated forms", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        expect(mkCandidate("option", s) as string).toBe(
          mkProven("option", s.replace(/^no_?/i, "")) as string,
        )
      }),
    )
  })

  test("mkProven option does NOT strip no_", () => {
    expect(mkProven("option", "no_autocd") as string).toBe("noautocd")
    expect(mkCandidate("option", "no_autocd") as string).toBe("autocd")
  })
})
