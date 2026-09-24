import * as fcu from "@carlwr/fastcheck-utils"
import { trim } from "@carlwr/typescript-extra"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { boxTable, label, num } from "../../../nlp/node/eval/box-table"

describe("box table", () => {
  it("draws the frame, pads by character count, aligns per column", () => {
    const t = boxTable(
      [label("category"), num("mech"), num("n")],
      [
        ["builtin", "0.912", "12"],
        ["zle_widget", "—", "·"],
        ["x", "10.000", "1234"],
      ],
    )
    expect(t).toBe(
      [
        "┌────────────┬────────┬──────┐",
        "│ category   │   mech │    n │",
        "├────────────┼────────┼──────┤",
        "│ builtin    │  0.912 │   12 │",
        "│ zle_widget │      — │    · │",
        "│ x          │ 10.000 │ 1234 │",
        "└────────────┴────────┴──────┘",
        "",
      ].join("\n"),
    )
  })

  it("every line is as wide as every other; one row per input row, in order", () => {
    const cell = fc
      .string({ unit: "grapheme", maxLength: 6 })
      .filter(s => !/[\n│]/.test(s))
    fc.assert(
      fc.property(
        fcu.nonEmptyArray(fcu.record({ head: cell, right: fc.boolean() }), {
          maxLength: 4,
        }),
        fc.array(fc.array(cell, { maxLength: 4 }), { maxLength: 4 }),
        (cols, rows) => {
          const lines = boxTable(cols, rows).split("\n")
          expect(lines.at(-1)).toBe("")
          const body = lines.slice(0, -1)
          expect(body).toHaveLength(rows.length + 4)
          const width = [...(body[0] ?? "")].length
          for (const l of body) expect([...l].length).toBe(width)
          rows.forEach((r, i) => {
            const cells = body[3 + i]?.split("│").slice(1, -1).map(trim)
            expect(cells).toEqual(cols.map((_, k) => (r[k] ?? "").trim()))
          })
        },
      ),
    )
  })

  it("pads by code point: an astral character is one column wide", () => {
    expect(boxTable([label("id")], [["𐀀"], ["ab"]])).toBe(
      "┌────┐\n│ id │\n├────┤\n│ 𐀀  │\n│ ab │\n└────┘\n",
    )
  })

  it("a header wider than every cell sets the width; no rows is a frame", () => {
    expect(boxTable([label("id slice"), num("score")], [])).toBe(
      "┌──────────┬───────┐\n│ id slice │ score │\n├──────────┼───────┤\n└──────────┴───────┘\n",
    )
  })
})
