import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  advanceQuote,
  isQuoted,
  mkQuoteState,
  type QuoteState,
} from "../quote-state"

function scan(s: string): QuoteState {
  let st = mkQuoteState()
  for (const ch of s) st = advanceQuote(st, ch)
  return st
}

describe("advanceQuote", () => {
  test("initial state is unquoted", () => {
    expect(isQuoted(mkQuoteState())).toBe(false)
  })

  test("single quote opens and closes", () => {
    expect(isQuoted(scan("'"))).toBe(true)
    expect(isQuoted(scan("''"))).toBe(false)
  })

  test("double quote opens and closes", () => {
    expect(isQuoted(scan('"'))).toBe(true)
    expect(isQuoted(scan('""'))).toBe(false)
  })

  test("backtick opens and closes", () => {
    expect(isQuoted(scan("`"))).toBe(true)
    expect(isQuoted(scan("``"))).toBe(false)
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
    expect(scan("\"'").dq).toBe(true)
    expect(scan("\"'").sq).toBe(false)
  })

  test("double quote inside single quotes is literal", () => {
    expect(scan("'\"").sq).toBe(true)
    expect(scan("'\"").dq).toBe(false)
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

  test("matched single-quote pairs leave unquoted", () => {
    fc.assert(
      fc.property(fc.string(), s => {
        expect(isQuoted(scan(`'${s.replace(/'/g, "x")}'`))).toBe(false)
      }),
    )
  })
})
