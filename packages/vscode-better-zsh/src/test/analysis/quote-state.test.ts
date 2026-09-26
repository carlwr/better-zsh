import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  advanceQuote,
  isQuoted,
  mkQuoteState,
  type QuoteState,
} from "../../analysis/quote-state"

function scan(s: string): QuoteState {
  let st = mkQuoteState()
  for (const ch of s) st = advanceQuote(st, ch)
  return st
}

describe("advanceQuote", () => {
  test("initial state is unquoted", () => {
    expect(isQuoted(mkQuoteState())).toBe(false)
  })

  test("outside single quotes, a backslash quotes; with the next character, it leaves the state unchanged", () => {
    const special = ["'", '"', "`", "\\"] as const
    const next = fc.oneof(
      fcu.element(special),
      fc.string({ minLength: 1, maxLength: 1 }),
    )
    const cov = fcu.coverage({ special: 25 })
    fc.assert(
      fc.property(fc.string(), next, (s, c) => {
        const st = scan(s)
        fc.pre(!st.sq && !st.esc)
        expect(isQuoted(scan(`${s}\\`))).toBe(true)
        expect(scan(`${s}\\${c}`)).toEqual(st)
        if ((special as readonly string[]).includes(c)) cov.hit("special")
      }),
      { plugins: [cov.plugin] },
    )
  })

  test("backslash inside double quotes escapes", () => {
    const st = scan('"\\')
    expect(st.dq).toBe(true)
    expect(st.esc).toBe(true)
    expect(isQuoted(scan('"\\n'))).toBe(true) // still in dq
  })

  test.each([
    [
      "single quote inside double quotes is literal",
      "\"'",
      { dq: true, sq: false },
    ],
    [
      "double quote inside single quotes is literal",
      "'\"",
      { sq: true, dq: false },
    ],
    [
      "backslash inside single quotes is literal",
      "'\\",
      { sq: true, esc: false },
    ],
  ] as const)("%s", (_desc, input, want) => {
    expect(scan(input)).toMatchObject(want)
  })

  // The body's own quote char and backslashes are neutralized, so the closing
  // quote is the only one that can close.
  test("an opening quote quotes; closing it unquotes", () => {
    fc.assert(
      fc.property(fcu.element(["'", '"', "`"]), fc.string(), (q, s) => {
        expect(isQuoted(scan(q))).toBe(true)
        const body = s.replace(new RegExp(`[\\\\${q}]`, "g"), "x")
        expect(isQuoted(scan(q + body + q))).toBe(false)
      }),
    )
  })
})
