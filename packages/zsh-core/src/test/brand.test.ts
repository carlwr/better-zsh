import * as fcu from "@carlwr/fastcheck-utils"
import { isNonEmpty } from "@carlwr/typescript-extra"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { mkDocumented } from "../docs/brands"
import { docCategories } from "../docs/taxonomy"
import { mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")
describe("mkDocumented", () => {
  const nonOption = docCategories.filter(c => c !== "option")
  if (!isNonEmpty(nonOption)) throw new Error("no non-option category")

  test("equals trim for every category but option", () => {
    fc.assert(
      fc.property(fcu.element(nonOption), fc.string(), (cat, s) => {
        expect(mkDocumented(cat, s) as string).toBe(s.trim())
      }),
    )
  })

  // Underscores are stripped after the trim (as in resolver.rs), so an
  // underscore next to whitespace can surface an edge space: `_ a` -> ` a`.
  test("is idempotent unless an underscore touches whitespace", () => {
    expect(opt("_ a") as string).toBe(" a")
    fc.assert(
      fc.property(fcu.element(docCategories), fc.string(), (cat, s) => {
        fc.pre(!/_\s|\s_/.test(s))
        const once = mkDocumented(cat, s)
        expect(mkDocumented(cat, once)).toBe(once)
      }),
    )
  })
})

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
