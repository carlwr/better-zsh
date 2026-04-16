import { describe, expect, test } from "vitest"
import type { DocCorpus } from "../docs/corpus"
import { resolveOption } from "../docs/corpus"
import { mkDocumented_ } from "./id-fns"

const opt = mkDocumented_("option")

const empty = new Map() as unknown as ReadonlyMap<never, never>
const corpus: DocCorpus = {
  option: new Map([
    [opt("AUTO_CD"), {} as never],
    [opt("NOTIFY"), {} as never],
  ]),
  cond_op: empty,
  builtin: empty,
  precmd: empty,
  shell_param: empty,
  reserved_word: empty,
  redir: empty,
  process_subst: empty,
  subscript_flag: empty,
  param_flag: empty,
  history: empty,
  glob_op: empty,
  glob_flag: empty,
}

describe("resolveOption", () => {
  test.each([
    ["AUTO_CD", opt("autocd"), false],
    ["auto_cd", opt("autocd"), false],
    ["  AUTO_CD  ", opt("autocd"), false],
    ["NO_AUTO_CD", opt("autocd"), true],
    ["noautocd", opt("autocd"), true],
    // literal "notify" is in corpus → wins over stripped "tify"
    ["notify", opt("notify"), false],
    // literal "nonotify" not in corpus → fallback: stripped "notify", negated
    ["NO_NOTIFY", opt("notify"), true],
  ] as const)("%s", (raw, id, negated) => {
    expect(resolveOption(corpus, raw)).toEqual({ id, negated })
  })

  test.each(["bogus", "no_bogus"])("%s → undefined", raw => {
    expect(resolveOption(corpus, raw)).toBeUndefined()
  })
})
