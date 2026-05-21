import { advanceQuote, isQuoted, mkQuoteState } from "./quote-state.ts"

// zsh treats `#` as a comment only at word start. Word starters: line start,
// whitespace, or one of `;|&(`. Mid-word `#` (`abc#def`, `$#`, `${#}`,
// `$a#tail`, `a=1#2`) is literal.
//
// `)` is intentionally absent: `(cmd)#tail` is a comment in zsh, but
// `$(cmd)#tail` is not — distinguishing the two requires tracking `$(`
// stack depth (we only track `${` braces). The conservative miss is harmless
// for downstream consumers (semantic tokens, hover, fact extraction all
// degrade gracefully).
const WORD_BOUNDARY = /[\s;|&(]/

/**
 * Find the start index of a `#` comment on a line, respecting quotes and
 * parameter expansion. Returns undefined if the line has no comment.
 */
export function commentStart(line: string): number | undefined {
  let st = mkQuoteState()
  let braceDepth = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i)
    if (!isQuoted(st)) {
      if (braceDepth === 0 && ch === "#") {
        const prev = line[i - 1]
        if (!prev || WORD_BOUNDARY.test(prev)) return i
      }
      if (ch === "$" && line[i + 1] === "{") braceDepth++
      else if (braceDepth > 0 && ch === "}") braceDepth--
    }
    st = advanceQuote(st, ch)
  }
}
