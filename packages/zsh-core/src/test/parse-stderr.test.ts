import { describe, expect, test } from "vitest"
import { parseZshError } from "../exec/zsh"

describe("parseZshError", () => {
  test.each([
    [
      "standard error with line number",
      "/dev/stdin:3: parse error near 'fi'",
      { line: 3, msg: "parse error near 'fi'" },
    ],
    [
      "line 1 error",
      '/dev/stdin:1: unmatched "',
      { line: 1, msg: 'unmatched "' },
    ],
    [
      "zsh -c format with line number",
      "zsh:2: parse error near `then'",
      { line: 2, msg: "parse error near `then'" },
    ],
    [
      "newline-terminated error",
      "/dev/stdin:2: parse error near `\\n'\n",
      { line: 2, msg: "parse error near `\\n'" },
    ],
    [
      "unexpected format falls back to line 1",
      "something went wrong",
      { line: 1, msg: "something went wrong" },
    ],
    [
      "multiline stderr picks first matching line",
      "some warning\n/dev/stdin:5: parse error near 'done'\nother stuff",
      { line: 5, msg: "parse error near 'done'" },
    ],
  ])("%s", (_label, stderr, want) => {
    expect(parseZshError(stderr)).toEqual(want)
  })

  test.each(["", "  \n  "])("empty/blank stderr returns undefined: %j", s => {
    expect(parseZshError(s)).toBeUndefined()
  })
})
