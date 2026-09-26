import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { commentStart } from "../../analysis/comment"
import { commentyLine } from "./test-util"

describe("commentStart", () => {
  test.each([
    // Comment cases
    ["#bare line start", "#hello", 0],
    ["after whitespace", "echo a # tail", 7],
    ["after ;", "echo a;#comment", 7],
    ["after |", "true|#xxx", 5],
    ["after &", "true&#bg", 5],
    ["after ( (subshell open)", "(#cmt\necho a)", 1],
    ["after $( (cmd subst open)", "echo $(#cmt\necho a)", 7],

    // No-comment cases (mid-word #)
    ["literal mid-word", "echo abc#def", undefined],
    ["escaped", "echo \\# nope", undefined],
    ["$# is not a comment", "echo $#", undefined],
    ["${#} is not a comment", "argc=${#}", undefined],
    ["${#var} not a comment", 'echo "${#x}"', undefined],
    ["${name#pat} not a comment", "x=${path#prefix}", undefined],
    ["assignment value", "a=1#2", undefined],
    ["after expansion", "echo $a#tail", undefined],
    ["inside single quotes", "echo 'a # b'", undefined],
    ["inside double quotes", 'echo "a # b"', undefined],

    // Mixed
    ["close brace then comment", "echo ${x} # c", 10],
  ])("%s", (_desc, line, expected) => {
    expect(commentStart(line)).toBe(expected)
  })

  test("a comment start is a `#` fixed by the text up to it", () => {
    const cov = fcu.coverage({ comment: 20 })
    fc.assert(
      fc.property(commentyLine, fc.string({ maxLength: 10 }), (line, tail) => {
        const i = commentStart(line)
        if (i === undefined) return
        cov.hit("comment")
        expect(line[i]).toBe("#")
        expect(commentStart(line.slice(0, i + 1) + tail)).toBe(i)
      }),
      { plugins: [cov.plugin] },
    )
  })
})
