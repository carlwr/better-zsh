import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { wordMatches } from "../../document/words"
import { expectStrictlyAscending, lineDoc } from "../test-util"

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

  const vocab = fcu.element([
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
  ])
  const itemsArb = fc.array(vocab, { maxLength: 6 })
  const lineArb = itemsArb.map(xs => xs.join(" "))

  test("ranges hold the word, don't overlap, ascend, and stay clear of comments", () => {
    fc.assert(
      fc.property(fcu.nonEmptyArray(lineArb, { maxLength: 4 }), lines => {
        const rs = wordMatches(lineDoc(lines.join("\n")), "foo")
        for (const r of rs) {
          const text = lines[r.start.line] ?? ""
          expect(r.end.line).toBe(r.start.line)
          expect(text.slice(r.start.character, r.end.character)).toBe("foo")
          expect(/[\w-]/.test(text[r.start.character - 1] ?? "")).toBe(false)
          expect(/[\w-]/.test(text[r.end.character] ?? "")).toBe(false)
          const cut = text.indexOf("#")
          if (cut >= 0) expect(r.end.character).toBeLessThanOrEqual(cut)
        }
        expectStrictlyAscending(rs.map(r => [r.start.line, r.start.character]))
      }),
    )
  })

  test("each line matches once per standalone, `$`- or quote-wrapped `foo` before its comment", () => {
    const standalone: ReadonlySet<string> = new Set([
      "foo",
      "$foo",
      '"foo"',
      "'foo'",
    ])
    fc.assert(
      fc.property(fcu.nonEmptyArray(itemsArb, { maxLength: 4 }), items => {
        const ranges = wordMatches(
          lineDoc(items.map(xs => xs.join(" ")).join("\n")),
          "foo",
        )
        items.forEach((xs, line) => {
          const cut = xs.indexOf("# foo")
          const active = cut < 0 ? xs : xs.slice(0, cut)
          expect(ranges.filter(r => r.start.line === line)).toHaveLength(
            active.filter(x => standalone.has(x)).length,
          )
        })
      }),
    )
  })
})
