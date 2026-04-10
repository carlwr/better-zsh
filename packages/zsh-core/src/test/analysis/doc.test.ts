import { describe, expect, test } from "vitest"
import { continuedText } from "../../analysis/doc"

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
