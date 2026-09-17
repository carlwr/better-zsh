import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { funcDecl, funcDecls, wordMatches } from "../editor/funcs"
import { lineDoc } from "./test-util"

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

describe("funcDecls", () => {
  test("both declaration forms, in order; first declaration wins by name", () => {
    const doc = lineDoc(
      ["alpha() {", "}", "function beta {", "}", "alpha() { :; }"].join("\n"),
    )
    expect(
      funcDecls(doc).map(f => [f.name, f.selectionRange.start.line]),
    ).toEqual([
      ["alpha", 0],
      ["beta", 2],
      ["alpha", 4],
    ])
    expect(funcDecl(doc, "alpha")?.range.start.line).toBe(0)
    expect(funcDecl(doc, "gamma")).toBeUndefined()
  })
})

describe("function docs", () => {
  const docOf = (src: string, name: string) => funcDecl(lineDoc(src), name)?.doc
  test.each([
    [
      "# above funcname()",
      "# does stuff\n# usage: foo arg\nfoo() {",
      "foo",
      "does stuff\nusage: foo arg",
    ],
    [
      "# above function keyword",
      "# the bar func\nfunction bar {",
      "bar",
      "the bar func",
    ],
    [
      "# below declaration",
      "my-func()\n# inline doc\n# second line",
      "my-func",
      "inline doc\nsecond line",
    ],
    ["above wins over below", "# above\nfoo()\n# below", "foo", "above"],
    ["no adjacent comment", "foo() {\n  echo hi\n}", "foo", undefined],
    [
      "blank line breaks collection",
      "# orphan comment\n\nfoo() {",
      "foo",
      undefined,
    ],
    ["dashed name", "# my docs\nmy-long-name() {", "my-long-name", "my docs"],
    [
      "shebang is not a docstring",
      "#!/usr/bin/env zsh\nfoo() {",
      "foo",
      undefined,
    ],
    [
      "$0 in text",
      "cheer()\n  # docs line1\n  # usage: $0 TITLE\n  # example: $0 Mister -> prints 'You go, Mister!'",
      "cheer",
      "docs line1\nusage: $0 TITLE\nexample: $0 Mister -> prints 'You go, Mister!'",
    ],
  ])("%s", (_, src, name, want) => {
    expect(docOf(src, name)).toBe(want)
  })

  test("each function gets its own docs", () => {
    const doc = lineDoc("# doc a\na()\n\n# doc b\nb()")
    expect(funcDecls(doc).map(f => [f.name, f.doc])).toEqual([
      ["a", "doc a"],
      ["b", "doc b"],
    ])
  })
})
