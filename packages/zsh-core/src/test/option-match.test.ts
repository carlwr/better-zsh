import * as assert from "node:assert"
import { matchOptions } from "../option-match"
import { mkOptName } from "../types/brand"

const opts = ["aliases", "errexit", "errreturn", "extendedglob", "notify"].map(
  mkOptName,
)

function labels(typed: string) {
  return matchOptions(opts, typed).map((m) => m.label)
}

suite("matchOptions", () => {
  const cases: [string, string[], string?][] = [
    ["er", ["errexit", "errreturn"], "base prefix"],
    ["err_ret", ["errreturn"], "underscore ignored in input"],
    ["ERR_RET", ["errreturn"], "case ignored in input"],
    [
      "no_er",
      ["no_errexit", "no_errreturn"],
      "no-prefix preserves no_ separator",
    ],
    [
      "noer",
      ["no_errexit", "no_errreturn"],
      "noer without underscore still gives no_ labels",
    ],
    ["noti", ["notify"], "option genuinely starting with 'no' stays bare"],
  ]

  for (const [typed, expected, desc] of cases) {
    test(desc ?? typed, () => {
      assert.deepStrictEqual(labels(typed), expected)
    })
  }

  test("no bare options leak when typing negation prefix", () => {
    const result = matchOptions(opts, "no_er")
    const bare = result.filter((m) => !m.label.startsWith("no_"))
    assert.deepStrictEqual(bare, [])
  })
})
