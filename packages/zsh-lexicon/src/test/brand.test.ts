import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { mkDocumented } from "../docs/brands"
import { loadLexicon } from "../docs/lexicon"
import { type DocCategory, docCategories } from "../docs/taxonomy"
import { mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")
describe("mkDocumented", () => {
  test("equals trim for every category but option", () => {
    const nonOption = fcu.element(docCategories).filter(c => c !== "option")
    fc.assert(
      fc.property(nonOption, fc.string(), (cat, s) => {
        expect(mkDocumented(cat, s)).toBe(s.trim())
      }),
    )
  })

  test("is idempotent", () => {
    expect(opt("_ a")).toBe("a")
    fc.assert(
      fc.property(fcu.element(docCategories), fc.string(), (cat, s) => {
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
    // `no_` is lexicon-aware negation handled by the resolver, not the
    // constructor; the `no` prefix passes through normalization unchanged.
    ["NO_AUTO_CD", "noautocd"],
    ["NOTIFY", "notify"],
    ["no_autocd", "noautocd"],
  ])("%s -> %s", (raw, want) => {
    expect(opt(raw)).toBe(want)
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

// Extractors mint cross-references on the trusted path, unchecked; each must
// name a record the lexicon holds.
describe("cross-references name lexicon records", () => {
  const lexicon = loadLexicon()
  const vals = <K extends DocCategory>(cat: K) => [...lexicon[cat].values()]
  test.each<[string, DocCategory, readonly string[]]>([
    [
      "option alias target",
      "option",
      vals("option").flatMap(r => r.aliasOf?.target ?? []),
    ],
    [
      "builtin alias target",
      "builtin",
      vals("builtin").flatMap(r => r.aliasOf?.target ?? []),
    ],
    [
      "tied special param",
      "special_param",
      vals("special_param").flatMap(r => r.tied ?? []),
    ],
    [
      "alternate-form requires",
      "option",
      vals("complex_command").flatMap(r =>
        r.alternateForms.flatMap(a => a.requires ?? []),
      ),
    ],
  ])("%s", (_, cat, refs) => {
    const ids = new Set<string>(lexicon[cat].keys())
    expect(refs.length).toBeGreaterThan(0)
    expect(refs.filter(id => !ids.has(id))).toEqual([])
  })
})
