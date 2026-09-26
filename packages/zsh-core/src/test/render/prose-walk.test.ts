import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  anyProseLine,
  proseLines,
  splitInlineCode,
  stripInlineCode,
  walkProseLines,
} from "../../render/prose-walk"

const tickish = fc.string({ unit: fcu.element(["`", "``", "a", " "]) })

describe("prose lines", () => {
  const mdArb = fc
    .array(
      fcu.element([
        "```",
        "```zsh",
        "   ```",
        "- ```",
        "    ```",
        "a",
        "`b`",
        "",
      ]),
    )
    .map(ls => ls.join("\n"))

  test("walkProseLines transforms exactly the proseLines", () => {
    fc.assert(
      fc.property(mdArb, md => {
        const marked = walkProseLines(md, l => `\0${l}`)
          .split("\n")
          .filter(l => l.startsWith("\0"))
          .map(l => l.slice(1))
        expect(marked).toEqual([...proseLines(md)])
        expect(walkProseLines(md, l => l)).toBe(md)
      }),
    )
  })

  test("anyProseLine agrees with proseLines", () => {
    const hasA = (l: string) => l.includes("a")
    const cov = fcu.coverage({ some: 12, none: 30 })
    fc.assert(
      fc.property(mdArb, md => {
        const want = [...proseLines(md)].some(hasA)
        cov.hit(want ? "some" : "none")
        expect(anyProseLine(md, hasA)).toBe(want)
      }),
      { plugins: [cov.plugin] },
    )
  })
})

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
    const cov = fcu.coverage({ code: 8 })
    fc.assert(
      fc.property(tickish, s => {
        for (const code of splitInlineCode(s).filter((_, i) => i % 2 === 1)) {
          cov.hit("code")
          const fence = code.match(/^`+/)?.[0] ?? ""
          const inner = code.slice(fence.length, code.length - fence.length)
          expect(code.endsWith(fence) && inner.length > 0).toBe(true)
          expect(inner.match(/`+/g) ?? []).not.toContain(fence)
        }
      }),
      { plugins: [cov.plugin] },
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

describe("stripInlineCode", () => {
  test("leaves no code span", () => {
    fc.assert(
      fc.property(tickish, s => {
        const t = stripInlineCode(s)
        expect(splitInlineCode(t)).toEqual([t])
      }),
    )
  })
})
