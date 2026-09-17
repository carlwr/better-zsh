import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  continuedText,
  lineStarts,
  offsetAt,
  positionAt,
} from "../../analysis/doc"
import { mockDoc } from "./test-util"

describe("offset model", () => {
  test("every separator is one character", () => {
    expect(lineStarts(mockDoc(["ab", "", "c"]))).toEqual([0, 3, 4])
  })

  test("positionAt inverts offsetAt for every character of every line", () => {
    const lines = fc.array(fc.stringMatching(/^[a-z ]{0,5}$/), {
      minLength: 1,
      maxLength: 6,
    })
    fc.assert(
      fc.property(lines, ls => {
        const starts = lineStarts(mockDoc(ls))
        ls.forEach((text, line) => {
          // the separator position belongs to the next line
          const last = line === ls.length - 1 ? text.length : text.length - 1
          for (let char = 0; char <= last; char++)
            expect(positionAt(starts, offsetAt(starts, line, char))).toEqual({
              line,
              char,
            })
        })
      }),
    )
  })
})

describe("continuedText", () => {
  test.each([
    ["single line, no continuation", ["setopt autocd"], 0, 0, "setopt autocd"],
    [
      "strips trailing backslash and joins",
      ["setopt \\", "  autocd"],
      0,
      1,
      "setopt autocd",
    ],
    [
      "multi-line continuation",
      ["setopt \\", "  autocd \\", "  beep"],
      0,
      2,
      "setopt autocd beep",
    ],
    ["empty block", [""], 0, 0, ""],
    ["trims whitespace from each piece", ["  a  \\  ", "  b  "], 0, 1, "a b"],
    [
      "respects start/end slice bounds",
      ["ignored", "setopt \\", "  autocd", "also ignored"],
      1,
      2,
      "setopt autocd",
    ],
    [
      "ignores comment text via activeText",
      ["setopt autocd # comment"],
      0,
      0,
      "setopt autocd",
    ],
  ])("%s", (_desc, lines, startLine, endLine, expected) => {
    expect(continuedText(lines, startLine, endLine)).toBe(expected)
  })
})
