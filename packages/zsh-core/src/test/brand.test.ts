import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { mkObserved } from "../docs/brands"
import { docCategories } from "../docs/taxonomy"
import { mkOptFlag } from "../docs/types"
import { mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")
const cond = mkDocumented_("conditional_op")

// `mkDocumented` / `mkObserved` are a provenance-only split; both share the
// same per-category `norm` table (see `brands.ts`). The brand-symmetry test
// covers any future drift between them across every category, so per-brand
// behavioural tests below only target `mkDocumented`.

describe("mkDocumented option (normalizes case + strips underscores)", () => {
  test.each([
    ["EXTENDED_GLOB", "extendedglob"],
    ["extended_glob", "extendedglob"],
    ["AUTO_CD", "autocd"],
    ["auto_cd", "autocd"],
    // `no_` is corpus-aware negation handled by the resolver, not the
    // constructor; the `no` prefix passes through normalization unchanged.
    ["NO_AUTO_CD", "noautocd"],
    ["NOTIFY", "notify"],
    ["no_autocd", "noautocd"],
  ])("%s -> %s", (raw, want) => {
    expect(opt(raw) as string).toBe(want)
  })

  test("idempotent", () => {
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

// Catches a future per-brand normalization override on any category.
// `fc.constantFrom(...docCategories)` covers `option` and every other
// category, including the precmd_modifier / process_subst literal-union
// branches of `Documented<K>` / `Observed<K>`.
test("brand symmetry: mkObserved coincides with mkDocumented", () => {
  fc.assert(
    fc.property(fc.constantFrom(...docCategories), fc.string(), (cat, s) => {
      expect(mkObserved(cat, s) as string).toBe(mkDocumented_(cat)(s) as string)
    }),
  )
})
