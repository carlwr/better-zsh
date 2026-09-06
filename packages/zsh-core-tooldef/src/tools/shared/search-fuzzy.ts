import type { DocCategory } from "@carlwr/zsh-core/taxonomy"
import fuzzysort from "fuzzysort"
import type { BaseMatch } from "./entries.ts"

const FUZZY_THRESHOLD = 0.3

/** fuzzysort's "no cap" sentinel for `limit`. */
const UNLIMITED = 0

export function fuzzySortMatches(
  q: string,
  pool: readonly BaseMatch[],
): ReadonlyArray<{ readonly obj: BaseMatch; readonly score: number }> {
  return fuzzysort.go(q, [...pool], {
    keys: ["id", "display"],
    threshold: FUZZY_THRESHOLD,
    // fuzzysort>=4 defaults to 10; callers need the untruncated tier.
    limit: UNLIMITED,
  })
}

export function seenKey(cat: DocCategory, id: string): string {
  return `${cat}\0${id}`
}
