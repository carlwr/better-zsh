import { describe, expect, test } from "vitest"
import type { DocCorpus } from "../docs/corpus"
import { resolve, resolverFeedback } from "../docs/resolver"
import { mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")

const empty = new Map() as unknown as ReadonlyMap<never, never>
const corpus: DocCorpus = {
  option: new Map([
    [opt("AUTO_CD"), {} as never],
    [opt("NOTIFY"), {} as never],
  ]),
  conditional_op: empty,
  builtin: empty,
  precmd_modifier: empty,
  special_param: empty,
  complex_command: empty,
  reserved_word: empty,
  redirection: empty,
  process_subst: empty,
  param_expn: empty,
  subscript_flag: empty,
  param_expn_flag: empty,
  history_expn: empty,
  glob_op: empty,
  glob_flag: empty,
  glob_qualifier: empty,
  prompt_escape: empty,
  zle_widget: empty,
  keymap: empty,
  job_spec: empty,
  arith_op: empty,
  special_function: empty,
}

describe("resolve(corpus, 'option', raw) — option identity", () => {
  test.each([
    ["AUTO_CD", opt("autocd")],
    ["auto_cd", opt("autocd")],
    ["  AUTO_CD  ", opt("autocd")],
    ["NO_AUTO_CD", opt("autocd")],
    ["noautocd", opt("autocd")],
    // literal "notify" is in corpus → wins over stripped "tify"
    ["notify", opt("notify")],
    // literal "nonotify" not in corpus → fallback: stripped "notify"
    ["NO_NOTIFY", opt("notify")],
  ] as const)("%s", (raw, id) => {
    expect(resolve(corpus, "option", raw)).toEqual({ category: "option", id })
  })

  test.each(["bogus", "no_bogus"])("%s → undefined", raw => {
    expect(resolve(corpus, "option", raw)).toBeUndefined()
  })
})

describe("resolverFeedback(corpus, 'option', raw) — input-negated", () => {
  test.each([
    "NO_AUTO_CD",
    "noautocd",
    "NO_NOTIFY",
  ])("%s → input-negated", raw => {
    expect(resolverFeedback(corpus, "option", raw)).toEqual({
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
    expect(resolverFeedback(corpus, "option", raw)).toBeUndefined()
  })
})

describe("resolverFeedback — non-option categories never emit feedback", () => {
  test.each([
    "conditional_op",
    "builtin",
    "redirection",
    "history_expn",
    "glob_flag",
    "special_function",
  ] as const)("%s → undefined", cat => {
    expect(resolverFeedback(corpus, cat, "anything")).toBeUndefined()
  })
})
