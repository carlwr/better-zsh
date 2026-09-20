/**
 * @module
 * Resolver / feedback tests against small synthetic corpora. The membership
 * corpus lets us test edge cases that the real-corpus tests in
 * `resolver.test.ts` can't reach — e.g. "literal wins over stripped" for
 * `option` (needs a corpus *without* the stripped form), or `subscripted`
 * feedback for `special_param` (needs a known base record without the
 * subscript).
 */

import { describe, expect, test } from "vitest"
import { identity, mkDocumented, mkOptFlag } from "../docs/brands"
import type { DocCorpus } from "../docs/corpus"
import {
  type ResolvedHit,
  type ResolverFeedback,
  resolve,
} from "../docs/resolver"
import { type DocCategory, mkRecordId } from "../docs/taxonomy"
import type { OptFlagAlias, ZshOption } from "../docs/types"
import { emptyCorpus, membershipCorpus, mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")
const NEGATED: ResolverFeedback = { kind: "input-negated" }

/**
 * Expected `resolve` answer over `corpus` (`toEqual` treats `feedback:
 * undefined` as absent). The record is the corpus's own, so a test never
 * restates record content.
 */
const hitIn = <K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  id: string,
  feedback?: ResolverFeedback,
): ResolvedHit<K> => {
  const key = mkDocumented(cat, id)
  const record = corpus[cat].get(key)
  if (record === undefined) throw new Error(`test corpus lacks ${cat} ${id}`)
  return { ...mkRecordId(cat, key), record, feedback }
}

const optCorpus = membershipCorpus("option", ["AUTO_CD", "NOTIFY"])

// Record-shaped option corpus: the flag path reads `flags`, which the
// membership corpus leaves undefined.
const alias = (
  char: string,
  on: OptFlagAlias["on"],
  emulations: OptFlagAlias["emulations"],
): OptFlagAlias => ({ char: mkOptFlag(char), on, emulations })
const ZSH: OptFlagAlias["emulations"] = ["csh", "zsh"]
const KSH: OptFlagAlias["emulations"] = ["ksh", "sh"]
const option = (
  name: string,
  flags: readonly OptFlagAlias[],
): readonly [ZshOption["id"], ZshOption] => [
  opt(name),
  {
    ...identity("option", name, name),
    flags,
    defaultIn: [],
    section: "Shell State",
    desc: "",
  },
]
const flagCorpus = emptyCorpus({
  option: new Map([
    option("AUTO_CD", [alias("J", "-", ZSH)]),
    option("RCS", [alias("f", "+", ZSH)]),
    // sh/ksh-only letter: `-b` is a bad option in plain zsh
    option("NOTIFY", [alias("5", "-", ZSH), alias("b", "-", KSH)]),
    // same zsh letter twice (impossible in the real corpus): first wins
    option("FIRST", [alias("Q", "-", ZSH)]),
    option("SECOND", [alias("Q", "+", ZSH)]),
    option("X", []),
  ]),
})
const spCorpus = membershipCorpus("special_param", ["compstate", "pipestatus"])
// Punctuation + named params for the `$`/`${…}` sigil-strip path.
const sigilCorpus = membershipCorpus("special_param", [
  "#",
  "?",
  "PATH",
  "compstate",
])

describe("resolve(corpus, 'option', raw) — identity + input-negated", () => {
  test.each<[string, string, ResolverFeedback?]>([
    ["AUTO_CD", "autocd"],
    ["auto_cd", "autocd"],
    ["  AUTO_CD  ", "autocd"],
    ["NO_AUTO_CD", "autocd", NEGATED],
    ["noautocd", "autocd", NEGATED],
    // literal "notify" is in corpus → wins over stripped "tify"
    ["notify", "notify"],
    // literal "nonotify" not in corpus → fallback: stripped "notify"
    ["NO_NOTIFY", "notify", NEGATED],
  ])("%s -> %s %j", (raw, id, feedback) => {
    expect(resolve(optCorpus, "option", raw)).toEqual(
      hitIn(optCorpus, "option", id, feedback),
    )
  })

  test.each(["bogus", "no_bogus"])("%s → undefined", raw => {
    expect(resolve(optCorpus, "option", raw)).toBeUndefined()
  })
})

describe("resolve(corpus, 'option', raw) — short flags", () => {
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
    // duplicate zsh letter: first in corpus order, with its own polarity
    ["-Q", "first"],
    ["+Q", "first", NEGATED],
  ])("%s → %s %j", (raw, id, feedback) => {
    expect(resolve(flagCorpus, "option", raw)).toEqual(
      hitIn(flagCorpus, "option", id, feedback),
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
    "-JJ",
    "-ex",
    "set -J",
    "J",
  ])("%s → undefined", raw => {
    expect(resolve(flagCorpus, "option", raw)).toBeUndefined()
  })

  // Literal and `no_`-stripped forms are tried before the flag path (no input
  // has both shapes, so this pins that they still work in a flag corpus).
  test("literal and no_-stripped forms still resolve", () => {
    expect(resolve(flagCorpus, "option", "X")).toEqual(
      hitIn(flagCorpus, "option", "X"),
    )
    expect(resolve(flagCorpus, "option", "NO_X")).toEqual(
      hitIn(flagCorpus, "option", "X", NEGATED),
    )
  })
})

describe("resolve(corpus, 'special_param', raw) — subscripted", () => {
  test.each([
    ["compstate[context]", "context"],
    ["pipestatus[1]", "1"],
    ["compstate[a.b]", "a.b"],
  ])("%s → subscript %j", (raw, subscript) => {
    const parent = raw.slice(0, raw.indexOf("["))
    expect(resolve(spCorpus, "special_param", raw)).toEqual(
      hitIn(spCorpus, "special_param", parent, {
        kind: "subscripted",
        subscript,
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
    expect(resolve(spCorpus, "special_param", raw)?.feedback).toBeUndefined()
  })
})

describe("resolve(corpus, 'special_param', raw) — $/${…} sigil strip", () => {
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
    expect(resolve(sigilCorpus, "special_param", raw)).toEqual(
      hitIn(sigilCorpus, "special_param", id),
    )
  })

  test("sigiled subscript strips both sigil and `[...]`, with feedback", () => {
    expect(
      resolve(sigilCorpus, "special_param", "$compstate[context]"),
    ).toEqual(
      hitIn(sigilCorpus, "special_param", "compstate", {
        kind: "subscripted",
        subscript: "context",
      }),
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
    expect(resolve(sigilCorpus, "special_param", raw)).toBeUndefined()
  })
})
