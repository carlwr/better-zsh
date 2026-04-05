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

let id = 0

function doc(text: string) {
  const lines = text.split("\n")
  return {
    uri: { toString: () => `test://doc/${id++}` },
    version: 1,
    lineCount: lines.length,
    lineAt(i: number) {
      return { text: lines[i] ?? "" }
    },
  } as import("vscode").TextDocument
}

suite("funcs", () => {
  test("commentStart skips quoted hashes", () => {
    assert.strictEqual(commentStart(`echo "# nope" # yep`), 14)
    assert.strictEqual(commentStart("echo '# nope'"), undefined)
    assert.strictEqual(commentStart("echo \\# nope"), undefined)
  })

  test("wordMatches skip comments keep strings", () => {
    const ranges = wordMatches(
      doc(
        ["foo() {", '  echo "foo"', "}", "foo", "# foo", "echo x # foo"].join(
          "\n",
        ),
      ),
      "foo",
    )
    assert.deepStrictEqual(
      ranges.map((r) => [r.start.line, r.start.character]),
      [
        [0, 0],
        [1, 8],
        [3, 0],
      ],
    )
  })

  test("funcDecls and docs", () => {
    const got = doc(
      ["# doc", "alpha() {", "}", "", "# beta", "function beta {", "}"].join(
        "\n",
      ),
    )
    assert.deepStrictEqual(
      funcDecls(got).map((f) => f.name),
      ["alpha", "beta"],
    )
    assert.strictEqual(funcDocs(got).get("alpha"), "doc")
    assert.strictEqual(funcDocs(got).get("beta"), "beta")
  })
})
