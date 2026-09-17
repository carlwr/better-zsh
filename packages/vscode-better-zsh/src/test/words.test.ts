import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { filterTokens, WORD_EXACT } from "../editor/words"

describe("filterTokens", () => {
  test("example", () => {
    expect(
      filterTokens([
        "echo",
        "$x",
        ";",
        "{",
        "my-func",
        "-flag",
        "my-func",
        "a_b",
      ]),
    ).toEqual(["echo", "my-func", "a_b"])
  })

  test("keeps exactly the word-like tokens, once each, in first-occurrence order", () => {
    const token = fc.oneof(
      fc.stringMatching(/^[\w-]{1,4}$/),
      fc.constantFrom("$x", ";", "&&", "()", '"q"'),
    )
    fc.assert(
      fc.property(fc.array(token), tokens => {
        const out = filterTokens(tokens)
        expect(new Set(out).size).toBe(out.length)
        expect(out).toEqual(
          tokens.filter(
            (t, i) => WORD_EXACT.test(t) && tokens.indexOf(t) === i,
          ),
        )
      }),
    )
  })
})
