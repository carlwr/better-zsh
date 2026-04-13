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
  for (const [typed, want] of [
    ["er", ["errexit", "errreturn"]],
    ["err_ret", ["errreturn"]],
    ["ERR_RET", ["errreturn"]],
    ["no_er", ["no_errexit", "no_errreturn"]],
    ["noer", ["no_errexit", "no_errreturn"]],
    ["noti", ["notify"]],
  ] as const) {
    test(typed, () => {
      assert.deepStrictEqual(labels(typed), want)
    })
  }

  test("no bare options leak when typing negation prefix", () => {
    const result = matchOptions(opts, "no_er")
    const bare = result.filter((m) => !m.label.startsWith("no_"))
    assert.deepStrictEqual(bare, [])
  })
})
