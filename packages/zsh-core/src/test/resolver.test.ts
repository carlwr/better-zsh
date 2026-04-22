import { describe, expect, test } from "vitest"
import { loadCorpus, resolve } from "../docs/corpus"
import { mkDocumented_ } from "./id-fns"

const corpus = loadCorpus()

const hist = mkDocumented_("history")
const subFlag = mkDocumented_("subscript_flag")
const parFlag = mkDocumented_("param_flag")
const glFlag = mkDocumented_("glob_flag")

describe("resolveHistory (event designators)", () => {
  test.each([
    ["!!", hist("!!")],
    ["!42", hist("!n")],
    ["!-3", hist("!-n")],
    ["!foo", hist("!str")],
    ["!?bar", hist("!?str[?]")],
    ["!?bar?", hist("!?str[?]")],
    ["!#", hist("!#")],
    ["!{...}", hist("!{...}")],
    // ^old^new shorthand resolves to the `!!` record
    ["^old^new", hist("!!")],
    ["^old^new^", hist("!!")],
    // whitespace is trimmed
    ["  !42  ", hist("!n")],
  ] as const)("%s -> %s", (raw, expected) => {
    const got = resolve(corpus, "history", raw)
    expect(got).toEqual({ category: "history", id: expected })
  })

  test.each([
    // word-designators / modifiers in isolation must NOT resolve
    "0",
    "a",
    "n",
    ":h",
    "h",
    // caret shorthand needs two `^` and a body before the second
    "^",
    "^^",
    "^foo",
    // lone `!` with no body
    "!",
    // `!!` with extra chars is not a bare designator
    "!!bogus",
    // unrelated tokens
    "unrelated",
    "",
    "   ",
  ])("%s -> undefined", raw => {
    expect(resolve(corpus, "history", raw)).toBeUndefined()
  })
})

describe("parens-agnostic flag resolvers", () => {
  // Verified via `zsh-data-assets.test.ts`: real corpus has bare-letter keys
  // (`w` subscript, `@` / `a` param, `i` glob). The resolver must accept both
  // the corpus-key form and the user-code parenthesized form.

  describe("subscript_flag", () => {
    test.each([
      ["w", subFlag("w")],
      ["(w)", subFlag("w")],
      ["e", subFlag("e")],
      ["(e)", subFlag("e")],
    ] as const)("%s -> %s", (raw, expected) => {
      expect(resolve(corpus, "subscript_flag", raw)).toEqual({
        category: "subscript_flag",
        id: expected,
      })
    })

    test.each(["Z", "(Z)", "()", "(", ")", ""])("%s -> undefined", raw => {
      expect(resolve(corpus, "subscript_flag", raw)).toBeUndefined()
    })
  })

  describe("param_flag", () => {
    test.each([
      ["@", parFlag("@")],
      ["(@)", parFlag("@")],
      ["U", parFlag("U")],
      ["(U)", parFlag("U")],
    ] as const)("%s -> %s", (raw, expected) => {
      expect(resolve(corpus, "param_flag", raw)).toEqual({
        category: "param_flag",
        id: expected,
      })
    })

    test.each(["Z", "(Z)", ""])("%s -> undefined", raw => {
      expect(resolve(corpus, "param_flag", raw)).toBeUndefined()
    })
  })

  describe("glob_flag", () => {
    test.each([
      ["i", glFlag("i")],
      ["(i)", glFlag("i")],
      ["(#i)", glFlag("i")],
      ["I", glFlag("I")],
      ["(#I)", glFlag("I")],
    ] as const)("%s -> %s", (raw, expected) => {
      expect(resolve(corpus, "glob_flag", raw)).toEqual({
        category: "glob_flag",
        id: expected,
      })
    })

    test.each(["Z", "(Z)", "(#Z)", "(#)", ""])("%s -> undefined", raw => {
      expect(resolve(corpus, "glob_flag", raw)).toBeUndefined()
    })
  })
})
