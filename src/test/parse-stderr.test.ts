import * as assert from "node:assert"
import { parseZshError } from "../core/zsh"

suite("parseZshError", () => {
  test("standard error with line number", () => {
    assert.deepStrictEqual(
      parseZshError("/dev/stdin:3: parse error near 'fi'"),
      { line: 3, msg: "parse error near 'fi'" },
    )
  })

  test("line 1 error", () => {
    assert.deepStrictEqual(parseZshError('/dev/stdin:1: unmatched "'), {
      line: 1,
      msg: 'unmatched "',
    })
  })

  test("zsh -c format with line number", () => {
    assert.deepStrictEqual(parseZshError("zsh:2: parse error near `then'"), {
      line: 2,
      msg: "parse error near `then'",
    })
  })

  test("newline-terminated error", () => {
    assert.deepStrictEqual(
      parseZshError("/dev/stdin:2: parse error near `\\n'\n"),
      { line: 2, msg: "parse error near `\\n'" },
    )
  })

  test("empty stderr returns undefined", () => {
    assert.strictEqual(parseZshError(""), undefined)
    assert.strictEqual(parseZshError("  \n  "), undefined)
  })

  test("unexpected format falls back to line 1", () => {
    assert.deepStrictEqual(parseZshError("something went wrong"), {
      line: 1,
      msg: "something went wrong",
    })
  })

  test("multiline stderr picks first matching line", () => {
    const stderr =
      "some warning\n/dev/stdin:5: parse error near 'done'\nother stuff"
    assert.deepStrictEqual(parseZshError(stderr), {
      line: 5,
      msg: "parse error near 'done'",
    })
  })
})
