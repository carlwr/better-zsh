import * as assert from "node:assert"
import { vi } from "vitest"

vi.mock("vscode", () => ({
  Range: class {
    start: { line: number; character: number }
    end: { line: number; character: number }

    constructor(
      startLine: number,
      startChar: number,
      endLine: number,
      endChar: number,
    ) {
      this.start = { line: startLine, character: startChar }
      this.end = { line: endLine, character: endChar }
    }
  },
}))

import { funcDocs as buildFuncDocs } from "../funcs"
import { lineDoc } from "./test-util"

const docs = (text: string) => buildFuncDocs(lineDoc(text, "hover"))

suite("buildFuncDocs", () => {
  for (const [name, src, fn, want] of [
    [
      "comment block above funcname()",
      "# does stuff\n# usage: foo arg\nfoo() {",
      "foo",
      "does stuff\nusage: foo arg",
    ],
    [
      "comment block above function keyword form",
      "# the bar func\nfunction bar {",
      "bar",
      "the bar func",
    ],
    [
      "comment block below declaration",
      "my-func()\n# inline doc\n# second line",
      "my-func",
      "inline doc\nsecond line",
    ],
    [
      "prefers above over below when both present",
      "# above\nfoo()\n# below",
      "foo",
      "above",
    ],
    [
      "no docs for functions without adjacent comments",
      "foo() {\n  echo hi\n}",
      "foo",
      undefined,
    ],
    [
      "blank line breaks comment collection",
      "# orphan comment\n\nfoo() {",
      "foo",
      undefined,
    ],
    [
      "dashed function names work",
      "# my docs\nmy-long-name() {",
      "my-long-name",
      "my docs",
    ],
    [
      "comments below declaration with $0 in text",
      "cheer()\n  # docs line1\n  # usage: $0 TITLE\n  # example: $0 Mister -> prints 'You go, Mister!'",
      "cheer",
      [
        "docs line1",
        "usage: $0 TITLE",
        "example: $0 Mister -> prints 'You go, Mister!'",
      ].join("\n"),
    ],
  ] as const) {
    test(name, () => {
      assert.strictEqual(docs(src).get(fn), want)
    })
  }

  test("multiple functions each get their docs", () => {
    assert.deepStrictEqual(
      [...docs("# doc a\na()\n\n# doc b\nb()")],
      [
        ["a", "doc a"],
        ["b", "doc b"],
      ],
    )
  })
})
