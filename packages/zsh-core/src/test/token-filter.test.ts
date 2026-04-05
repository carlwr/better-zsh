import * as assert from "node:assert"
import { filterTokens } from "../ident"

suite("filterTokens", () => {
  test("keeps identifier-like tokens and deduplicates", () => {
    const input = ["echo", "$x", ";", "{", "}", "my-func", "my-func"]
    assert.deepStrictEqual(filterTokens(input), ["echo", "my-func"])
  })

  test("empty input returns empty", () => {
    assert.deepStrictEqual(filterTokens([]), [])
  })

  test("filters out operators and special tokens", () => {
    const input = ["()", "&&", "||", "|", ">>", "<<", ";;"]
    assert.deepStrictEqual(filterTokens(input), [])
  })

  test("keeps dashed and underscored identifiers", () => {
    const input = ["my-func", "my_var", "a-b-c", "_priv"]
    assert.deepStrictEqual(filterTokens(input), [
      "my-func",
      "my_var",
      "a-b-c",
      "_priv",
    ])
  })

  test("filters out tokens starting with special characters", () => {
    const input = ["$var", '"hello"', "'world'", "-flag"]
    assert.deepStrictEqual(filterTokens(input), [])
  })

  test("preserves order of first occurrence", () => {
    const input = ["b", "a", "c", "a", "b"]
    assert.deepStrictEqual(filterTokens(input), ["b", "a", "c"])
  })
})
