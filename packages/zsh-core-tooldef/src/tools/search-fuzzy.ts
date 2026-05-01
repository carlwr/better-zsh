import type { DocCategory } from "@carlwr/zsh-core/taxonomy"
import fuzzysort from "fuzzysort"
import type { BaseMatch } from "./entries.ts"

const FUZZY_THRESHOLD = 0.3

export function fuzzySortMatches(
  q: string,
  pool: readonly BaseMatch[],
): ReadonlyArray<{ readonly obj: BaseMatch; readonly score: number }> {
  return fuzzysort.go(q, [...pool], {
    keys: ["id", "display"],
    threshold: FUZZY_THRESHOLD,
  })
}

export function seenKey(cat: DocCategory, id: string): string {
  return `${cat}\0${id}`
}
