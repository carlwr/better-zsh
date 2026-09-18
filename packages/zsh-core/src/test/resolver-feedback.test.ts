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
import { resolve, resolverFeedback } from "../docs/resolver"
import { docCategories, mkPieceId } from "../docs/taxonomy"
import { mkOptFlag, type OptFlagAlias, type ZshOption } from "../docs/types"
import { emptyCorpus, membershipCorpus, mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")
const sp = mkDocumented_("special_param")
const optCorpus = membershipCorpus("option", ["AUTO_CD", "NOTIFY"])

// Record-shaped option corpus: the flag path reads `flags`, which the
// membership corpus leaves undefined.
const alias = (
  char: string,
  on: OptFlagAlias["on"],
  emulations: OptFlagAlias["emulations"],
): OptFlagAlias => ({ char: mkOptFlag(char), on, emulations })
const ZSH = ["csh", "zsh"] as const
const KSH = ["ksh", "sh"] as const
const option = (
  name: string,
  flags: readonly OptFlagAlias[],
): readonly [ZshOption["name"], ZshOption] => [
  opt(name),
  {
    name: opt(name),
    display: name,
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

describe("resolve(corpus, 'option', raw) — option identity", () => {
  test.each([
    ["AUTO_CD", "autocd"],
    ["auto_cd", "autocd"],
    ["  AUTO_CD  ", "autocd"],
    ["NO_AUTO_CD", "autocd"],
    ["noautocd", "autocd"],
    // literal "notify" is in corpus → wins over stripped "tify"
    ["notify", "notify"],
    // literal "nonotify" not in corpus → fallback: stripped "notify"
    ["NO_NOTIFY", "notify"],
  ])("%s -> %s", (raw, id) => {
    expect(resolve(optCorpus, "option", raw)).toEqual(
      mkPieceId("option", opt(id)),
    )
  })

  test.each(["bogus", "no_bogus"])("%s → undefined", raw => {
    expect(resolve(optCorpus, "option", raw)).toBeUndefined()
  })
})

describe("resolverFeedback(corpus, 'option', raw) — input-negated", () => {
  test.each(["NO_AUTO_CD", "noautocd", "NO_NOTIFY"])(
    "%s → input-negated",
    raw => {
      expect(resolverFeedback(optCorpus, "option", raw)).toEqual({
        kind: "input-negated",
      })
    },
  )

  test.each([
    "AUTO_CD",
    "auto_cd",
    "  AUTO_CD  ",
    "notify",
    // unresolved inputs emit no feedback
    "bogus",
    "no_bogus",
  ])("%s → undefined", raw => {
    expect(resolverFeedback(optCorpus, "option", raw)).toBeUndefined()
  })
})

describe("resolve / resolverFeedback(corpus, 'option', raw) — short flags", () => {
  test.each([
    // on-form: identity, no feedback
    ["-J", "autocd", false],
    ["+f", "rcs", false],
    ["  -J  ", "autocd", false],
    // flipped sign: the option's off state
    ["+J", "autocd", true],
    ["-f", "rcs", true],
    // zsh-table letter of an option that also has a ksh-only one
    ["-5", "notify", false],
    // duplicate zsh letter: first in corpus order, with its own polarity
    ["-Q", "first", false],
    ["+Q", "first", true],
  ] as const)("%s → %s (negated: %s)", (raw, id, negated) => {
    expect(resolve(flagCorpus, "option", raw)).toEqual(
      mkPieceId("option", opt(id)),
    )
    expect(resolverFeedback(flagCorpus, "option", raw)).toEqual(
      negated ? { kind: "input-negated" } : undefined,
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
    expect(resolverFeedback(flagCorpus, "option", raw)).toBeUndefined()
  })

  // Literal and `no_`-stripped forms are tried before the flag path (no input
  // has both shapes, so this pins that they still work in a flag corpus).
  test("literal and no_-stripped forms still resolve", () => {
    expect(resolve(flagCorpus, "option", "X")).toEqual(
      mkPieceId("option", opt("X")),
    )
    expect(resolve(flagCorpus, "option", "NO_X")).toEqual(
      mkPieceId("option", opt("X")),
    )
    expect(resolverFeedback(flagCorpus, "option", "NO_X")).toEqual({
      kind: "input-negated",
    })
  })
})

describe("resolverFeedback(corpus, 'special_param', raw) — subscripted", () => {
  test.each([
    ["compstate[context]", "context"],
    ["pipestatus[1]", "1"],
    ["compstate[a.b]", "a.b"],
  ])("%s → subscript %j", (raw, subscript) => {
    expect(resolverFeedback(spCorpus, "special_param", raw)).toEqual({
      kind: "subscripted",
      subscript,
    })
    const parent = raw.slice(0, raw.indexOf("["))
    expect(resolve(spCorpus, "special_param", raw)).toEqual(
      mkPieceId("special_param", sp(parent)),
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
  ])("%s → undefined", raw => {
    expect(resolverFeedback(spCorpus, "special_param", raw)).toBeUndefined()
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
      mkPieceId("special_param", sp(id)),
    )
  })

  test("sigiled subscript strips both sigil and `[...]`, with feedback", () => {
    expect(
      resolve(sigilCorpus, "special_param", "$compstate[context]"),
    ).toEqual(mkPieceId("special_param", sp("compstate")))
    expect(
      resolverFeedback(sigilCorpus, "special_param", "$compstate[context]"),
    ).toEqual({ kind: "subscripted", subscript: "context" })
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

// Structural invariant — feedback emits only when resolve succeeds (lossy
// success). Catches a future feedback override firing for unresolved input,
// without enumerating the feedback-emitting category set.
describe("resolverFeedback — only on resolve success", () => {
  const RAWS = ["", "anything", "NO_bogus", "x[y]"]
  test.each(docCategories)("%s: undefined when resolve is undefined", cat => {
    for (const corpus of [optCorpus, spCorpus]) {
      for (const raw of RAWS) {
        if (resolve(corpus, cat, raw) !== undefined) continue
        expect(resolverFeedback(corpus, cat, raw)).toBeUndefined()
      }
    }
  })
})
