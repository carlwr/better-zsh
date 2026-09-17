import { commentStart } from "@carlwr/zsh-core/analysis"

/** Word-like token pattern used by editor range lookups and validation. */
export const WORD = /[\w][\w-]*/
export const WORD_EXACT = new RegExp(`^${WORD.source}$`)

/** Where a line's code ends: its comment start, else its length. */
export const activeEnd = (line: string) => commentStart(line) ?? line.length

/** The code part of a line: comments are inactive syntax. */
export const activeText = (line: string) => line.slice(0, activeEnd(line))

/** Word-like tokens, deduplicated, in first-occurrence order. */
export const filterTokens = (tokens: Iterable<string>): string[] =>
  [...new Set(tokens)].filter(t => WORD_EXACT.test(t))
