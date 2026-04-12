/** Lightweight quote-tracking state for character-by-character scanning. */
export interface QuoteState {
  /** Inside single quotes */
  readonly sq: boolean
  /** Inside double quotes */
  readonly dq: boolean
  /** Inside backtick quotes */
  readonly bq: boolean
  /** Next character is escaped */
  readonly esc: boolean
}

export function mkQuoteState(): QuoteState {
  return { sq: false, dq: false, bq: false, esc: false }
}

export function isQuoted(st: QuoteState): boolean {
  return st.sq || st.dq || st.bq || st.esc
}

/**
 * Advance quote state by one character. Returns a new state.
 * Handles: single quotes, double quotes, backticks, backslash escapes.
 */
export function advanceQuote(st: QuoteState, ch: string): QuoteState {
  if (st.esc) return { ...st, esc: false }
  if (st.sq) return ch === "'" ? { ...st, sq: false } : st
  if (st.dq) {
    if (ch === "\\") return { ...st, esc: true }
    return ch === '"' ? { ...st, dq: false } : st
  }
  if (st.bq) {
    if (ch === "\\") return { ...st, esc: true }
    return ch === "`" ? { ...st, bq: false } : st
  }
  if (ch === "\\") return { ...st, esc: true }
  if (ch === "'") return { ...st, sq: true }
  if (ch === '"') return { ...st, dq: true }
  if (ch === "`") return { ...st, bq: true }
  return st
}
