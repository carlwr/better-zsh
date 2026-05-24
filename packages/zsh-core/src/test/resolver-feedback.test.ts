/**
 * @module
 * Resolver / feedback tests against small synthetic corpora. The membership
 * corpus lets us test edge cases that the real-corpus tests in
 * `resolver.test.ts` can't reach — e.g. "literal wins over stripped" for
 * `option` (needs a corpus *without* the stripped form), or `subscripted`
 * feedback for `special_param` (needs a known base record without the
 * subscript). Categories tested: `option`, `special_param`.
 */

import { describe, expect, test } from "vitest"
import { resolve, resolverFeedback } from "../docs/resolver"
import { docCategories, mkPieceId } from "../docs/taxonomy"
import { membershipCorpus, mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")
const sp = mkDocumented_("special_param")
const optCorpus = membershipCorpus("option", ["AUTO_CD", "NOTIFY"])
const spCorpus = membershipCorpus("special_param", ["compstate", "pipestatus"])

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
  test.each([
    "NO_AUTO_CD",
    "noautocd",
    "NO_NOTIFY",
  ])("%s → input-negated", raw => {
    expect(resolverFeedback(optCorpus, "option", raw)).toEqual({
      kind: "input-negated",
    })
  })

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
