/** Word-like token pattern used by editor range lookups and validation. */
export const WORD = /[\w][\w-]*/
export const WORD_EXACT = /^[\w][\w-]*$/

export function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Deduplicate and filter a token list down to word-like tokens. */
export function filterTokens(tokens: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tokens) {
    if (isWordLikeToken(t) && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

function isWordLikeToken(token: string): boolean {
  return WORD_EXACT.test(token)
}
