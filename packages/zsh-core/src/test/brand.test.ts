import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { mkOptFlag } from "../docs/types"
import { mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")
const cond = mkDocumented_("conditional_op")

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
