import { describe, expect, test } from "vitest"
import { commentStart } from "../../analysis/comment"

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
})
