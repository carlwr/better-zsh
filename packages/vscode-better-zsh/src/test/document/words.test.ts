import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { filterTokens, WORD_EXACT, wordMatches } from "../../document/words"
import { lineDoc } from "../test-util"

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

describe("wordMatches", () => {
  test("skips comments, keeps strings, whole words only", () => {
    const doc = lineDoc(
      [
        "foo() {",
        '  echo "foo"',
        "}",
        "foo foo-bar foobar",
        "# foo",
        "echo x # foo",
      ].join("\n"),
    )
    expect(
      wordMatches(doc, "foo").map(r => [r.start.line, r.start.character]),
    ).toEqual([
      [0, 0],
      [1, 8],
      [3, 0],
    ])
  })

  const vocab = fc.constantFrom(
    "foo",
    "foo-bar",
    "foobar",
    "_foo",
    "$foo",
    '"foo"',
    "'foo'",
    "# foo",
    ";",
    " ",
  )
  const lineArb = fc.array(vocab, { maxLength: 6 }).map(xs => xs.join(" "))

  test("ranges hold the word, don't overlap, ascend, and stay clear of comments", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 1, maxLength: 4 }), lines => {
        const doc = lineDoc(lines.join("\n"))
        let prev: [number, number] = [-1, -1]
        for (const r of wordMatches(doc, "foo")) {
          const text = lines[r.start.line] ?? ""
          expect(r.end.line).toBe(r.start.line)
          expect(text.slice(r.start.character, r.end.character)).toBe("foo")
          expect(/[\w-]/.test(text[r.start.character - 1] ?? "")).toBe(false)
          expect(/[\w-]/.test(text[r.end.character] ?? "")).toBe(false)
          const cut = text.indexOf("#")
          if (cut >= 0) expect(r.end.character).toBeLessThanOrEqual(cut)
          const [line, col] = [r.start.line, r.start.character]
          expect(line > prev[0] || (line === prev[0] && col > prev[1])).toBe(
            true,
          )
          prev = [line, col]
        }
      }),
    )
  })
})
