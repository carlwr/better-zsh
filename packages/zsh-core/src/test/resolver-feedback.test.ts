/**
 * @module
 * Resolver / feedback tests against small synthetic lexicons. The membership
 * lexicon lets us test edge cases that the real-lexicon tests in
 * `resolver.test.ts` can't reach — e.g. "literal wins over stripped" for
 * `option` (needs a lexicon *without* the stripped form), or `subscripted`
 * feedback for `special_param` (needs a known base record without the
 * subscript).
 */

import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { identity, mkDocumented } from "../docs/brands"
import type { Lexicon } from "../docs/lexicon"
import {
  type ResolvedHit,
  type ResolverFeedback,
  resolve,
} from "../docs/resolver"
import type { DocCategory } from "../docs/taxonomy"
import type { OptFlagAlias, OptionDoc } from "../docs/types"
import { emptyLexicon, membershipLexicon, mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")
const NEGATED: ResolverFeedback = { kind: "input-negated" }

/**
 * Expected `resolve` answer over `lexicon` (`toEqual` treats `feedback:
 * undefined` as absent). The record is the lexicon's own, so a test never
 * restates record content.
 */
const hitIn = <K extends DocCategory>(
  lexicon: Lexicon,
  cat: K,
  id: string,
  feedback?: ResolverFeedback,
): ResolvedHit<K> => {
  const key = mkDocumented(cat, id)
  const record = lexicon[cat].get(key)
  if (record === undefined) throw new Error(`test lexicon lacks ${cat} ${id}`)
  return { record, feedback }
}

const optLexicon = membershipLexicon("option", ["AUTO_CD", "NOTIFY"])

// Record-shaped option lexicon: the flag path reads `flags`, which the
// membership lexicon leaves undefined.
const alias = (
  char: string,
  on: OptFlagAlias["on"],
  emulations: OptFlagAlias["emulations"],
): OptFlagAlias => ({ char, on, emulations })
const ZSH: OptFlagAlias["emulations"] = ["csh", "zsh"]
const KSH: OptFlagAlias["emulations"] = ["ksh", "sh"]
const option = (
  name: string,
  flags: readonly OptFlagAlias[],
): readonly [OptionDoc["id"], OptionDoc] => [
  opt(name),
  {
    ...identity("option", name, name),
    flags,
    defaultIn: [],
    subKind: "Shell State",
    desc: "",
  },
]
const flagLexicon = emptyLexicon({
  option: new Map([
    option("AUTO_CD", [alias("J", "-", ZSH)]),
    option("RCS", [alias("f", "+", ZSH)]),
    // sh/ksh-only letter: `-b` is a bad option in plain zsh
    option("NOTIFY", [alias("5", "-", ZSH), alias("b", "-", KSH)]),
    // same zsh letter twice (impossible in the real lexicon): first wins
    option("FIRST", [alias("Q", "-", ZSH)]),
    option("SECOND", [alias("Q", "+", ZSH)]),
    option("X", []),
  ]),
})
const spLexicon = membershipLexicon("special_param", [
  "compstate",
  "pipestatus",
])
// Punctuation + named params for the `$`/`${…}` sigil-strip path.
const sigilLexicon = membershipLexicon("special_param", [
  "#",
  "?",
  "PATH",
  "compstate",
])

describe("resolve(lexicon, 'option', raw) — identity + input-negated", () => {
  test.each<[string, string, ResolverFeedback?]>([
    ["AUTO_CD", "autocd"],
    ["auto_cd", "autocd"],
    ["  AUTO_CD  ", "autocd"],
    ["NO_AUTO_CD", "autocd", NEGATED],
    ["noautocd", "autocd", NEGATED],
    // literal "notify" is in lexicon → wins over stripped "tify"
    ["notify", "notify"],
    // literal "nonotify" not in lexicon → fallback: stripped "notify"
    ["NO_NOTIFY", "notify", NEGATED],
  ])("%s -> %s %j", (raw, id, feedback) => {
    expect(resolve(optLexicon, "option", raw)).toEqual(
      hitIn(optLexicon, "option", id, feedback),
    )
  })

  test.each(["bogus", "no_bogus"])("%s → undefined", raw => {
    expect(resolve(optLexicon, "option", raw)).toBeUndefined()
  })
})

describe("resolve(lexicon, 'option', raw) — short flags", () => {
  test.each<[string, string, ResolverFeedback?]>([
    // on-form: identity, no feedback
    ["-J", "autocd"],
    ["+f", "rcs"],
    ["  -J  ", "autocd"],
    // flipped sign: the option's off state
    ["+J", "autocd", NEGATED],
    ["-f", "rcs", NEGATED],
    // zsh-table letter of an option that also has a ksh-only one
    ["-5", "notify"],
    // duplicate zsh letter: first in lexicon order, with its own polarity
    ["-Q", "first"],
    ["+Q", "first", NEGATED],
  ])("%s → %s %j", (raw, id, feedback) => {
    expect(resolve(flagLexicon, "option", raw)).toEqual(
      hitIn(flagLexicon, "option", id, feedback),
    )
  })

  test.each([
    // sh/ksh-only letter
    "-b",
    "+b",
    // case is significant: only `J` is a flag
    "-j",
    // not a single-letter flag
    "-",
    "--",
    "set -J",
    "J",
  ])("%s → undefined", raw => {
    expect(resolve(flagLexicon, "option", raw)).toBeUndefined()
  })

  test("a flag letter with trailing characters never resolves", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[+-][J5fQb][A-Za-z0-9]+$/), raw => {
        expect(resolve(flagLexicon, "option", raw)).toBeUndefined()
      }),
    )
  })

  // Literal and `no_`-stripped forms are tried before the flag path (no input
  // has both shapes, so this pins that they still work in a flag lexicon).
  test("literal and no_-stripped forms still resolve", () => {
    expect(resolve(flagLexicon, "option", "X")).toEqual(
      hitIn(flagLexicon, "option", "X"),
    )
    expect(resolve(flagLexicon, "option", "NO_X")).toEqual(
      hitIn(flagLexicon, "option", "X", NEGATED),
    )
  })
})

describe("resolve(lexicon, 'special_param', raw) — subscripted", () => {
  test("any subscript of a known name, bare or sigiled, surfaces as feedback", () => {
    const input = fcu.record({
      id: fcu.element(["compstate", "pipestatus"]),
      subscript: fc.string({ minLength: 1 }),
      wrap: fcu.element(["%", "$%", "${%}"]),
    })
    fc.assert(
      fc.property(input, ({ id, subscript, wrap }) => {
        const raw = wrap.replace("%", () => `${id}[${subscript}]`)
        expect(resolve(spLexicon, "special_param", raw)).toEqual(
          hitIn(spLexicon, "special_param", id, {
            kind: "subscripted",
            subscript,
          }),
        )
      }),
    )
  })

  test.each([
    // bare name resolves without feedback (loss-free path)
    "compstate",
    "pipestatus",
    // empty subscript regex requires content
    "compstate[]",
    // unknown base name doesn't resolve
    "unknown[x]",
    // not a subscripted shape
    "anything",
  ])("%s → no feedback", raw => {
    expect(resolve(spLexicon, "special_param", raw)?.feedback).toBeUndefined()
  })
})

describe("resolve(lexicon, 'special_param', raw) — $/${…} sigil strip", () => {
  test.each([
    // punctuation params: no leading letter, only reachable via the sigil
    ["$#", "#"],
    ["$?", "?"],
    ["${#}", "#"],
    // named params and braces
    ["$PATH", "PATH"],
    ["${PATH}", "PATH"],
    ["  $PATH  ", "PATH"],
  ])("%s -> %s", (raw, id) => {
    expect(resolve(sigilLexicon, "special_param", raw)).toEqual(
      hitIn(sigilLexicon, "special_param", id),
    )
  })

  test.each([
    // sigil wrapping nothing
    "$",
    "${}",
    // unknown bare name after stripping
    "$bogus",
    "${bogus}",
  ])("%s → undefined", raw => {
    expect(resolve(sigilLexicon, "special_param", raw)).toBeUndefined()
  })
})
