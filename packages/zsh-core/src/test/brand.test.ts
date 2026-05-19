import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { mkObserved } from "../docs/brands"
import { mkOptFlag } from "../docs/types"
import { mkDocumented_, mkObserved_ } from "./id-fns"

const opt = mkDocumented_("option")
const cond = mkDocumented_("conditional_op")
const optO = mkObserved_("option")

describe("mkDocumented option (normalizes case + strips underscores)", () => {
  test("normalizes known equivalences", () => {
    expect(opt("EXTENDED_GLOB")).toBe(opt("extendedglob"))
    expect(opt("EXTENDED_GLOB")).toBe(opt("extended_glob"))
    expect(opt("AUTO_CD")).toBe(opt("autocd"))
  })

  test("is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), s => {
        expect(opt(opt(s))).toBe(opt(s))
      }),
    )
  })

  test("result is lowercase, no underscores", () => {
    fc.assert(
      fc.property(fc.string(), s => {
        const r = opt(s)
        expect(r).toBe(r.toLowerCase())
        expect(r).not.toContain("_")
      }),
    )
  })
})

describe("mkDocumented conditional_op (trims)", () => {
  test("trims whitespace", () => {
    expect(cond("  -a  ")).toBe(cond("-a"))
  })

  test("preserves non-whitespace", () => {
    fc.assert(
      fc.property(fc.string(), s => {
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

// Provenance-only split; same normalization. `no_` negation belongs to the
// resolver, not the constructors. See `brands.ts`.
describe("mkObserved option is symmetric with mkDocumented option", () => {
  test("strips underscores and lowercases", () => {
    expect(optO("AUTO_CD") as string).toBe("autocd")
    expect(optO("auto_cd") as string).toBe("autocd")
  })

  test("does NOT strip leading `no` prefix", () => {
    expect(optO("NO_AUTO_CD") as string).toBe("noautocd")
    expect(optO("NOTIFY") as string).toBe("notify")
    expect(optO("no_autocd") as string).toBe("noautocd")
  })

  test("matches mkDocumented option for every input", () => {
    fc.assert(
      fc.property(fc.string(), s => {
        expect(optO(s) as string).toBe(opt(s) as string)
      }),
    )
  })

  test("known equivalence carries across both brands", () => {
    expect(optO("AUTO_CD") as string).toBe(opt("autocd") as string)
  })
})

// Non-option categories: the provenance-only split has no behavioural effect.
describe("mkObserved / mkDocumented coincide for non-option categories", () => {
  test("Observed and Documented produce equal strings", () => {
    const raw = "  -a  "
    expect(mkObserved("conditional_op", raw) as string).toBe(
      cond(raw) as string,
    )
  })
})
