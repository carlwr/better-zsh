import * as fcu from "@carlwr/fastcheck-utils"
import { allUnique, isNonEmpty } from "@carlwr/typescript-extra"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { matchOptions } from "../../editor/option-match"
import { docId } from "../test-util"

const mkOpts = (raw: readonly string[]) => raw.map(r => docId("option", r))
const opts = mkOpts([
  "aliases",
  "errexit",
  "errreturn",
  "extendedglob",
  "notify",
])
const labels = (typed: string) => matchOptions(opts, typed).map(m => m.label)

describe("matchOptions", () => {
  test.each([
    ["er", ["errexit", "errreturn"]],
    ["no_er", ["no_errexit", "no_errreturn"]],
    ["noti", ["notify"]],
    [
      "",
      [
        "aliases",
        "errexit",
        "errreturn",
        "extendedglob",
        "notify",
        "no_aliases",
        "no_errexit",
        "no_errreturn",
        "no_extendedglob",
        "no_notify",
      ],
    ],
  ])("%j", (typed, want) => {
    expect(labels(typed)).toEqual(want)
  })

  const nameArb = fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/)
  const optionArb = fc.uniqueArray(nameArb, { maxLength: 6 })
  const typedArb = fc.stringMatching(/^[a-z0-9]{0,4}$/)
  test("matching ignores case and underscores in the typed text", () => {
    fc.assert(
      fc.property(
        optionArb,
        typedArb,
        fcu.infiniteStream(fc.boolean()),
        (raw, typed, coins) => {
          const flip = () => fcu.getNext(coins)
          const us = () => (flip() ? "_" : "")
          const mangled =
            [...typed]
              .map(c => us() + (flip() ? c.toUpperCase() : c))
              .join("") + us()
          expect(matchOptions(mkOpts(raw), mangled)).toEqual(
            matchOptions(mkOpts(raw), typed),
          )
        },
      ),
    )
  })

  test("plain matches (label = id) precede `no_` matches (label = no_ + id); each id at most once per form", () => {
    // Typed text is often a prefix of an option, bare or `no`-prefixed: random
    // text alone next to never matches.
    const arb = optionArb.chain(raw => {
      const prefix = isNonEmpty(raw)
        ? fc
            .tuple(fcu.element(raw), fc.integer({ min: 1, max: 4 }))
            .map(([o, n]) => o.slice(0, n))
        : typedArb
      return fc.tuple(
        fc.constant(raw),
        fc.oneof(
          typedArb,
          prefix,
          prefix.map(p => `no${p}`),
        ),
      )
    })
    const cov = fcu.coverage({ plain: 8, negated: 12 })
    fc.assert(
      fc.property(arb, ([raw, typed]) => {
        const ms = matchOptions(mkOpts(raw), typed)
        const split = ms.findIndex(m => m.label.startsWith("no_"))
        const [plain, negated] =
          split < 0 ? [ms, []] : [ms.slice(0, split), ms.slice(split)]
        expect(plain.map(m => m.label)).toEqual(plain.map(m => m.canonical))
        expect(negated.map(m => m.label)).toEqual(
          negated.map(m => `no_${m.canonical}`),
        )
        for (const m of plain) expect(m.canonical.startsWith(typed)).toBe(true)
        for (const m of negated)
          expect(`no${m.canonical}`.startsWith(typed)).toBe(true)
        expect(allUnique(plain.map(m => m.canonical))).toBe(true)
        // Empty typed text matches everything, vacuously.
        if (typed && plain.length > 0) cov.hit("plain")
        if (typed && negated.length > 0) cov.hit("negated")
      }),
      { plugins: [cov.plugin] },
    )
  })

  test("every prefix of an option, plain, `no_`- or `NO`-typed, offers its form", () => {
    const arb = fcu
      .nonEmptyUniqueArray(nameArb, { maxLength: 6 })
      .chain(raw => fc.tuple(fc.constant(raw), fcu.element(raw)))
    // names are at most 9 long, so `n` spans every prefix, the name included
    fc.assert(
      fc.property(arb, fc.nat({ max: 9 }), ([raw, o], n) => {
        const p = o.slice(0, n)
        const offered = (typed: string) =>
          matchOptions(mkOpts(raw), typed).map(m => m.label)
        expect(offered(p)).toContain(o)
        expect(offered(`no_${p}`)).toContain(`no_${o}`)
        expect(offered(`NO${p.toUpperCase()}`)).toContain(`no_${o}`)
      }),
    )
  })
})
