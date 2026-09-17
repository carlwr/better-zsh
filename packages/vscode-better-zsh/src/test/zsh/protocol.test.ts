import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { parseZshError } from "../../zsh/protocol"

describe("parseZshError", () => {
  test.each([
    [
      "/tmp/better-zsh-x/script.zsh:3: parse error near 'fi'",
      { line: 3, msg: "parse error near 'fi'" },
    ],
    [
      "C:\\Temp\\script.zsh:3: parse error near `:'",
      { line: 3, msg: "parse error near `:'" },
    ],
    [
      "zsh:2: parse error near `then'",
      { line: 2, msg: "parse error near `then'" },
    ],
    [
      "/tmp/s.zsh:2: parse error near `\\n'\n",
      { line: 2, msg: "parse error near `\\n'" },
    ],
    ["something went wrong", { line: 1, msg: "something went wrong" }],
    [
      "some warning\n/tmp/s.zsh:5: parse error near 'done'\nother stuff",
      { line: 5, msg: "parse error near 'done'" },
    ],
    ["", undefined],
    ["  \n  ", undefined],
  ])("%j", (stderr, want) => {
    expect(parseZshError(stderr)).toEqual(want)
  })

  test("round-trips any `<script>:<line>: <msg>` line", () => {
    const msg = fc.stringMatching(/^[!-~][ -~]*$/).filter(s => !s.endsWith(" "))
    fc.assert(
      fc.property(
        fc.constantFrom(
          "/tmp/better-zsh-ab12/script.zsh",
          "C:\\T\\s.zsh",
          "zsh",
        ),
        fc.nat({ max: 99999 }),
        msg,
        (src, line, m) => {
          expect(parseZshError(`${src}:${line}: ${m}\n`)).toEqual({
            line,
            msg: m,
          })
        },
      ),
    )
  })
})
