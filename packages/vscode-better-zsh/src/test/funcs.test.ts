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

import { commentStart, funcDecls, funcDocs, wordMatches } from "../funcs"
import { lineDoc } from "./test-util"

suite("funcs", () => {
  test("commentStart skips quoted hashes", () => {
    for (const [src, want] of [
      [`echo "# nope" # yep`, 14],
      ["echo '# nope'", undefined],
      ["echo \\# nope", undefined],
    ] as const) {
      assert.strictEqual(commentStart(src), want)
    }
  })

  test("wordMatches skip comments keep strings", () => {
    const ranges = wordMatches(
      lineDoc(
        ["foo() {", '  echo "foo"', "}", "foo", "# foo", "echo x # foo"].join(
          "\n",
        ),
      ),
      "foo",
    )
    assert.deepStrictEqual(
      ranges.map(r => [r.start.line, r.start.character]),
      [
        [0, 0],
        [1, 8],
        [3, 0],
      ],
    )
  })

  test("funcDecls and docs", () => {
    const got = lineDoc(
      ["# doc", "alpha() {", "}", "", "# beta", "function beta {", "}"].join(
        "\n",
      ),
    )
    assert.deepStrictEqual(
      funcDecls(got).map(f => f.name),
      ["alpha", "beta"],
    )
    assert.deepStrictEqual(
      [...funcDocs(got)],
      [
        ["alpha", "doc"],
        ["beta", "beta"],
      ],
    )
  })
})
