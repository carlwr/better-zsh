import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  advanceQuote,
  isQuoted,
  mkQuoteState,
  type QuoteState,
} from "../analysis/quote-state"

function scan(s: string): QuoteState {
  let st = mkQuoteState()
  for (const ch of s) st = advanceQuote(st, ch)
  return st
}

describe("advanceQuote", () => {
  test("initial state is unquoted", () => {
    expect(isQuoted(mkQuoteState())).toBe(false)
  })

  test.each([
    ["'", "''"],
    ['"', '""'],
    ["`", "``"],
  ])("%s opens then closes", (q, pair) => {
    expect(isQuoted(scan(q))).toBe(true)
    expect(isQuoted(scan(pair))).toBe(false)
  })

  test("backslash escapes next char", () => {
    expect(isQuoted(scan("\\"))).toBe(true)
    expect(isQuoted(scan("\\x"))).toBe(false)
  })

  test("backslash inside double quotes escapes", () => {
    const st = scan('"\\')
    expect(st.dq).toBe(true)
    expect(st.esc).toBe(true)
    expect(isQuoted(scan('"\\n'))).toBe(true) // still in dq
  })

  test("single quote inside double quotes is literal", () => {
    const st = scan("\"'")
    expect(st.dq).toBe(true)
    expect(st.sq).toBe(false)
  })

  test("double quote inside single quotes is literal", () => {
    const st = scan("'\"")
    expect(st.sq).toBe(true)
    expect(st.dq).toBe(false)
  })

  test("backslash inside single quotes is literal", () => {
    const st = scan("'\\")
    expect(st.sq).toBe(true)
    expect(st.esc).toBe(false)
  })

  test("scan never throws on arbitrary input", () => {
    fc.assert(
      fc.property(fc.string(), s => {
        scan(s)
      }),
    )
  })

  // Matched-pair property holds for each quote style: a body with the active
  // quote's char replaced (so the pair is the only closing token) round-trips
  // to unquoted. Backslashes are also replaced, otherwise they'd escape the
  // closing quote in double/backtick contexts.
  test.each([
    ["'", "\\'"],
    ['"', '\\"'],
    ["`", "\\`"],
  ] as const)("matched %s pairs leave unquoted", (q, escapes) => {
    const escRe = new RegExp(`[${escapes}\\\\]`, "g")
    fc.assert(
      fc.property(fc.string(), s => {
        expect(isQuoted(scan(`${q}${s.replace(escRe, "x")}${q}`))).toBe(false)
      }),
    )
  })
})
