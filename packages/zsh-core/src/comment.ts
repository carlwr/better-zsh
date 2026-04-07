import { advanceQuote, isQuoted, mkQuoteState } from "./quote-state.ts"

/** Find the start index of a `#` comment on a line, respecting quotes. */
export function commentStart(line: string): number | undefined {
  let st = mkQuoteState()
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i)
    if (!isQuoted(st) && ch === "#") return i
    st = advanceQuote(st, ch)
  }
}
