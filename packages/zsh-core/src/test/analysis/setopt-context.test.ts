import * as assert from "node:assert"
import { isSetoptContext } from "../../analysis/setopt-context"

function doc(text: string) {
  const lines = text.split("\n")
  return {
    lineCount: lines.length,
    lineAt: (i: number) => ({ text: lines[i] ?? "" }),
  }
}

suite("isSetoptContext", () => {
  const yes: [string, number, string?][] = [
    ["setopt extendedglob", 0],
    ["unsetopt extendedglob", 0],
    ["setopt \\\n  errreturn \\\n  extendedglob", 2, "line continuation"],
    ["setopt \\\n  errreturn", 1, "continuation second line"],
    ["set -o extendedglob", 0, "set -o"],
    ["set +o extendedglob", 0, "set +o"],
    ["set -e -o pipefail", 0, "set short and long options"],
  ]

  const no: [string, number, string?][] = [
    ["echo setopt", 0, "setopt as argument"],
    ["echo hello", 0],
    ["set extendedglob", 0, "set without -o/+o"],
    ["", 0, "empty line"],
  ]

  for (const [text, line, desc] of yes) {
    test(`yes: ${desc ?? text}`, () => {
      assert.strictEqual(isSetoptContext(doc(text), line), true)
    })
  }

  for (const [text, line, desc] of no) {
    test(`no: ${desc ?? text}`, () => {
      assert.strictEqual(isSetoptContext(doc(text), line), false)
    })
  }
})
