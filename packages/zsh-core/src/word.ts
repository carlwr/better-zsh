/** Word-like token pattern (global -- stateful, call with care). */
export const WORD = /[\w][\w-]*/g
export const WORD_EXACT = /^[\w][\w-]*$/

export function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Deduplicate and filter a token list down to word-like tokens. */
export function filterTokens(tokens: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tokens) {
    if (WORD_EXACT.test(t) && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}
