import { describe, expect, test } from "vitest"
import { funcDecl, funcDecls } from "../../document/funcs"
import { lineDoc } from "../test-util"

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
