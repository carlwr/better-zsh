import { describe, expect, test } from "vitest"
import { unwrapDescription } from "../unwrap-description.ts"

describe("unwrapDescription", () => {
  test("joins adjacent non-indented lines with a single space", () => {
    const input =
      "Fetch the full record for a known `{ category, id }` from the\nbundled static zsh reference."
    expect(unwrapDescription(input)).toBe(
      "Fetch the full record for a known `{ category, id }` from the bundled static zsh reference.",
    )
  })

  test("preserves blank-line paragraph breaks", () => {
    const input = "Line A one\nLine A two.\n\nLine B one\nLine B two."
    expect(unwrapDescription(input)).toBe(
      "Line A one Line A two.\n\nLine B one Line B two.",
    )
  })

  test("preserves indented bullets verbatim within their paragraph", () => {
    const input = "Valid values:\n\n  - 'option'\n  - 'cond_op'\n  - 'builtin'"
    expect(unwrapDescription(input)).toBe(
      "Valid values:\n\n  - 'option'\n  - 'cond_op'\n  - 'builtin'",
    )
  })

  test("handles a single-line paragraph unchanged", () => {
    const input = "Ranking: exact id/display > prefix > fuzzy score."
    expect(unwrapDescription(input)).toBe(input)
  })

  test("mixed paragraph: flow prose ended by first indented line", () => {
    const input = "intro line one\nintro line two\n  bullet one\n  bullet two"
    expect(unwrapDescription(input)).toBe(
      "intro line one intro line two\n  bullet one\n  bullet two",
    )
  })

  test("empty input → empty output", () => {
    expect(unwrapDescription("")).toBe("")
  })

  test("single paragraph with trailing newline removed on rejoin", () => {
    const input = "just one line"
    expect(unwrapDescription(input)).toBe("just one line")
  })

  test("idempotent on already-flow prose", () => {
    const input = "A\n\nB\n\n  - b1\n  - b2"
    expect(unwrapDescription(unwrapDescription(input))).toBe(
      unwrapDescription(input),
    )
  })
})
