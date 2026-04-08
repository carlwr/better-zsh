import * as assert from "node:assert"
import { cmdPositions } from "../../analysis/cmd-position"

function cmds(line: string, commentAt?: number): string[] {
  return cmdPositions(line, commentAt).map((p) => line.slice(p.start, p.end))
}

suite("cmdPositions", () => {
  const cases: [string, string[], string?][] = [
    ["echo hey", ["echo"]],
    ["  echo hey", ["echo"]],
    ["{ echo hi }", ["echo"]],
    ["(echo hi)", ["echo"]],
    ["r() uname -a", ["uname"], "function definition name is not a command"],
    [">&2 echo hey", ["echo"], "redir before cmd"],
    ["2>&1 echo hey", ["echo"], "fd redir before cmd"],
    [">file echo hey", ["echo"], "redir to file before cmd"],
    [">>file echo hey", ["echo"], "append redir before cmd"],
    ["echo hey >file", ["echo"], "redir after args"],
    ["! echo hi", ["echo"], "negation"],
    ["echo hi # echo", ["echo"], "comment stops scan"],
    ["echo x | fg y", ["echo", "fg"]],
    ["echo hey; fg", ["echo", "fg"]],
    ["echo hey && fg", ["echo", "fg"]],
    ["echo hey || fg", ["echo", "fg"]],
    ["if echo; then fg; fi", ["echo", "fg"]],
    ["if ((1)) echo", ["echo"]],
    ["if ((1)) { echo }", ["echo"]],
    ["if ((1)) { echo; }", ["echo"]],
    ["while ((1)) { fc; }", ["fc"]],
    ["until ((1)) fc", ["fc"]],
    ["while echo;do fg;done", ["echo", "fg"]],
    ["for r in xs; do fg; done", ["fg"]],
    ["select r in xs; do fg; done", ["fg"]],
    ["case r in", []],
    [
      "print ${var[(a)1]} ${var[(r)1]} ${var[(s)1]}",
      ["print"],
      "parameter expansion flags do not create command positions",
    ],
    [
      "print ${(j:_:)SECONDS}",
      ["print"],
      "parameter expansion flags stay inside the word",
    ],
    [
      "print ${${:-x}[(r)1]}",
      ["print"],
      "nested parameter expansions stay inside the word",
    ],
  ]

  for (const [input, expected, desc] of cases) {
    test(desc ?? input, () => {
      const commentAt = input.includes(" # ")
        ? input.indexOf(" # ") + 1
        : undefined
      assert.deepStrictEqual(cmds(input, commentAt), expected)
    })
  }
})

// Known limitations — not yet handled, recorded for future improvement.
// Move to active test cases when the heuristic is extended.
//
// - Subshell command substitution: $(echo hi) — the echo inside $() is in cmd position
// - Backtick substitution: `echo hi`
// - Multi-line: while ...\n do — "do" on next line resets cmd position (line-local heuristic)

suite("cmdPositions edge cases", () => {
  const cases: [string, string[], string?][] = [
    ["f() { echo; }", ["echo"], "function body with semicolon"],
    ["f() { echo }", ["echo"], "function body without semicolon"],
    ["f() {echo}", ["{echo"], "no-space brace is part of the word"],
    ["echo a > file", ["echo"], "redir does not create a new cmd position"],
    [">&2 echo thing", ["echo"], "redir before command"],
    ["echo thing &> /dev/null", ["echo"], "&> redir after command"],
    ["echo thing &>> /dev/null", ["echo"], "&>> redir after command"],
    [
      'echo "$var" thing',
      ["echo"],
      "double-quoted parameter expansion stays in one word",
    ],
    [
      "echo ${var[(r)1]}",
      ["echo"],
      "subscript flag inside parameter expansion",
    ],
  ]

  for (const [input, expected, desc] of cases) {
    test(desc ?? input, () => {
      assert.deepStrictEqual(cmds(input), expected)
    })
  }
})
