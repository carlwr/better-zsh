import { mkDocumented } from "@carlwr/zsh-core/types"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { matchOptions } from "../../editor/option-match"

const mkOpts = (raw: readonly string[]) =>
  raw.map(r => mkDocumented("option", r))
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

  const optionArb = fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/), {
    maxLength: 6,
  })
  const typedArb = fc.stringMatching(/^[a-z0-9]{0,4}$/)
  // Random case flips and underscore insertions.
  const mangle = (s: string) =>
    fc
      .tuple(
        fc.array(fc.boolean(), { minLength: s.length, maxLength: s.length }),
        fc.array(fc.boolean(), {
          minLength: s.length + 1,
          maxLength: s.length + 1,
        }),
      )
      .map(
        ([flip, us]) =>
          [...s]
            .map(
              (c, i) => `${us[i] ? "_" : ""}${flip[i] ? c.toUpperCase() : c}`,
            )
            .join("") + (us[s.length] ? "_" : ""),
      )

  test("matching ignores case and underscores in the typed text", () => {
    fc.assert(
      fc.property(
        optionArb,
        typedArb.chain(t => fc.tuple(fc.constant(t), mangle(t))),
        (raw, [typed, mangled]) => {
          expect(matchOptions(mkOpts(raw), mangled)).toEqual(
            matchOptions(mkOpts(raw), typed),
          )
        },
      ),
    )
  })

  test("plain matches (label = id) precede `no_` matches (label = no_ + id); each id at most once per form", () => {
    fc.assert(
      fc.property(optionArb, typedArb, (raw, typed) => {
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
        expect(new Set(plain.map(m => m.canonical)).size).toBe(plain.length)
      }),
    )
  })
})
