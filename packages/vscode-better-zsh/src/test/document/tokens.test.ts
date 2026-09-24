import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  activeTokenRangeAt,
  isTokenDelimiter,
  symbolicOpRangeAt,
} from "../../document/tokens"
import { activeEnd } from "../../document/words"
import { lineDoc, pos } from "../test-util"

const word = fcu.element([
  "echo",
  "a-b",
  ";",
  "|",
  "&&",
  "<",
  ">&2",
  "(",
  ")",
  "{",
  "}",
  "[[",
  "==",
  "]]",
  "#",
  "x#y",
  "'a b'",
  "$v",
])
const lineArb = fc.array(word, { maxLength: 8 }).map(ws => ws.join(" "))

describe("activeTokenRangeAt", () => {
  test("off a delimiter and before the comment, yields the maximal delimiter-free run around the cursor", () => {
    fc.assert(
      fc.property(lineArb, line => {
        const doc = lineDoc(line)
        const cut = activeEnd(line)
        const delim = (i: number) => isTokenDelimiter(line[i] ?? "")
        for (let c = 0; c <= line.length; c++) {
          const r = activeTokenRangeAt(doc, pos(0, c))
          expect(r === undefined).toBe(c >= cut || delim(c))
          if (!r) continue
          const [s, e] = [r.start.character, r.end.character]
          expect(s <= c && c < e && e <= cut).toBe(true)
          expect([...line.slice(s, e)].some(isTokenDelimiter)).toBe(false)
          expect(s === 0 || delim(s - 1)).toBe(true)
          expect(e === cut || delim(e)).toBe(true)
        }
      }),
    )
  })
})

describe("symbolicOpRangeAt", () => {
  // Longest first, as the caller pre-sorts.
  const ops: readonly [string, ...string[]] = [
    "-nt",
    "=~",
    "==",
    "-f",
    "=",
    "<",
  ]
  const tok = fcu.element([...ops, "a", "[[", "]]", "x=y", "'=='", "#"])

  test("before the comment, on an operator token yields that whole token; else nothing", () => {
    fc.assert(
      fc.property(fc.array(tok, { maxLength: 6 }), ws => {
        const doc = lineDoc(ws.join(" "))
        const commented = ws.indexOf("#")
        let s = 0
        ws.forEach((w, i) => {
          const live = ops.includes(w) && (commented < 0 || i < commented)
          for (let c = s; c < s + w.length; c++) {
            const r = symbolicOpRangeAt(doc, pos(0, c), ops)
            expect(r && [r.start.character, r.end.character]).toEqual(
              live ? [s, s + w.length] : undefined,
            )
          }
          s += w.length + 1
        })
      }),
    )
  })
})
