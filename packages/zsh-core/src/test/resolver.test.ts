import { describe, expect, test } from "vitest"
import { loadCorpus, resolve } from "../docs/corpus"
import { mkDocumented_ } from "./id-fns"

const corpus = loadCorpus()

const hist = mkDocumented_("history")
const subFlag = mkDocumented_("subscript_flag")
const parFlag = mkDocumented_("param_flag")
const glFlag = mkDocumented_("glob_flag")
const glQual = mkDocumented_("glob_qualifier")
const jobSpec = mkDocumented_("job_spec")
const specFn = mkDocumented_("special_function")

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

  describe("glob_qualifier", () => {
    test.each([
      ["/", glQual("/")],
      ["(/)", glQual("/")],
      ["(#q/)", glQual("/")],
      ["@", glQual("@")],
      ["(#q@)", glQual("@")],
    ] as const)("%s -> %s", (raw, expected) => {
      expect(resolve(corpus, "glob_qualifier", raw)).toEqual({
        category: "glob_qualifier",
        id: expected,
      })
    })

    test.each(["Z", "(Z)", "(#qZ)", "(#q)", ""])("%s -> undefined", raw => {
      expect(resolve(corpus, "glob_qualifier", raw)).toBeUndefined()
    })
  })
})

describe("resolveJobSpec", () => {
  test.each([
    ["%%", jobSpec("%%")],
    ["%+", jobSpec("%+")],
    ["%-", jobSpec("%-")],
    ["%1", jobSpec("%number")],
    ["%42", jobSpec("%number")],
    ["%bash", jobSpec("%string")],
    ["%?foo", jobSpec("%?string")],
    ["  %1  ", jobSpec("%number")],
  ] as const)("%s -> %s", (raw, expected) => {
    expect(resolve(corpus, "job_spec", raw)).toEqual({
      category: "job_spec",
      id: expected,
    })
  })

  test.each([
    "",
    "   ",
    "foo",
    "1",
    "%",
    "%?",
    "not-a-spec",
  ])("%s -> undefined", raw => {
    expect(resolve(corpus, "job_spec", raw)).toBeUndefined()
  })
})

describe("resolveSpecialFunction", () => {
  test.each([
    ["chpwd", specFn("chpwd")],
    ["precmd", specFn("precmd")],
    ["TRAPDEBUG", specFn("TRAPDEBUG")],
    ["TRAPEXIT", specFn("TRAPEXIT")],
    ["TRAPZERR", specFn("TRAPZERR")],
    // hook array → hook record
    ["precmd_functions", specFn("precmd")],
    ["chpwd_functions", specFn("chpwd")],
    // TRAP* template fallback — any uncategorized signal name
    ["TRAPHUP", specFn("TRAPNAL")],
    ["TRAPUSR1", specFn("TRAPNAL")],
    ["TRAPINT", specFn("TRAPNAL")],
    // TRAPERR: not a literal corpus record (upstream treats it as xindex on
    // TRAPZERR), so it lands on the template.
    ["TRAPERR", specFn("TRAPNAL")],
  ] as const)("%s -> %s", (raw, expected) => {
    expect(resolve(corpus, "special_function", raw)).toEqual({
      category: "special_function",
      id: expected,
    })
  })

  test.each([
    "",
    "   ",
    // `_functions` only resolves for the closed hook set
    "foo_functions",
    "bar_functions",
    // TRAP must be followed by an uppercase/digit tail
    "TRAP",
    "TRAPfoo",
    "unrelated",
  ])("%s -> undefined", raw => {
    expect(resolve(corpus, "special_function", raw)).toBeUndefined()
  })
})
