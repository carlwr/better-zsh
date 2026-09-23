import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { splitInlineCode } from "../../render/prose-walk"

const tickish = fc.string({ unit: fcu.element(["`", "``", "a", " "]) })

describe("splitInlineCode", () => {
  test.each([
    ["a `b` c", ["a ", "`b`", " c"]],
    ["``a`b``", ["", "``a`b``", ""]],
    ["`a``", ["`a``"]],
    ["`a```", ["`a```"]],
    ["`a` `b", ["", "`a`", " `b"]],
    ["``", ["``"]],
  ])("%j", (line, want) => {
    expect(splitInlineCode(line)).toEqual(want)
  })

  test("parts join back to the line", () => {
    fc.assert(
      fc.property(tickish, s => {
        expect(splitInlineCode(s).join("")).toBe(s)
      }),
    )
  })

  // CommonMark: a span is closed by the first later run of its opener's length.
  test("code parts open and close on one run length, absent inside", () => {
    fc.assert(
      fc.property(tickish, s => {
        for (const code of splitInlineCode(s).filter((_, i) => i % 2 === 1)) {
          const fence = code.match(/^`+/)?.[0] ?? ""
          const inner = code.slice(fence.length, code.length - fence.length)
          expect(code.endsWith(fence) && inner.length > 0).toBe(true)
          expect(inner.match(/`+/g) ?? []).not.toContain(fence)
        }
      }),
    )
  })

  test("prose parts hold only runs no later run closes", () => {
    fc.assert(
      fc.property(tickish, s => {
        const parts = splitInlineCode(s)
        parts.forEach((part, i) => {
          if (i % 2 === 1) return
          const rest = parts.slice(i).join("")
          for (const run of part.matchAll(/`+/g)) {
            const later = rest.slice(run.index + run[0].length).match(/`+/g)
            expect(later ?? []).not.toContain(run[0])
          }
        })
      }),
    )
  })
})
