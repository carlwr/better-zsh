import { isNonEmpty, type NonEmpty, nonEmpty } from "@carlwr/typescript-extra"
import type { FlagEntry, FlagGroup } from "../../types.ts"
import {
  collectAliasedEntries,
  extractItems,
  extractSectionBody,
  splitBodyAtAllNestedLists,
  withBody,
  type YodlEntry,
} from "../core/doc.ts"
import type { YNodeSeq, YodlSrc } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

// Shape shared by every record category whose body carries flag-style nested
// lists.
export interface SigDescBody {
  readonly desc: string
  readonly flagGroups?: readonly FlagGroup[]
  readonly outro?: string
}

// Consecutive `xitem(...)` headers preceding an `item(...)(body)` fold onto
// the body-bearing item; each alias plus the head becomes an entry sharing
// the same desc.
export function collectSigDescPairs(
  entries: readonly YodlEntry[],
): FlagEntry[] {
  const out: FlagEntry[] = []
  for (const grp of collectAliasedEntries(
    entries,
    h => normalizeHeader(h) || undefined,
  )) {
    // branch narrows for `NonEmpty`; `[...aliases, head]` alone isn't
    // provably non-empty to TS even though `head` is always present.
    const sigs: NonEmpty<string> = isNonEmpty(grp.aliases)
      ? [...grp.aliases, grp.head]
      : nonEmpty(grp.head)
    out.push({ sigs, desc: normalizeBody(grp.entry.body ?? []) })
  }
  return out
}

/**
 * Splits a body at each top-level depth-1 nested item list. Most builtins /
 * comp-utils document one flag set; a few (`typeset`, `_arguments`) document
 * multiple sibling lists. The first group's intro is empty (its preceding
 * prose lives in the returned `desc`).
 *
 * Falls back to a flat `desc` when no nested list exists or none of the
 * captured lists contain sig-bearing entries.
 */
export function splitFlagBody(body: YNodeSeq): SigDescBody {
  const split = splitBodyAtAllNestedLists(body)
  if (!split) return { desc: normalizeBody(body) }

  const flagGroups: FlagGroup[] = []
  for (const g of split.groups) {
    const flags = collectSigDescPairs(g.entries)
    if (flags.length === 0) continue
    const intro = flagGroups.length === 0 ? "" : normalizeBody(g.preIntro)
    flagGroups.push({ intro, flags })
  }
  if (flagGroups.length === 0) return { desc: normalizeBody(body) }

  const desc = normalizeBody(split.intro)
  const outro = normalizeBody(split.outro)
  return outro ? { desc, flagGroups, outro } : { desc, flagGroups }
}

export function parseFlagSection<T>(
  yo: YodlSrc,
  section: string,
  mkFlag: (raw: string) => T,
): readonly {
  readonly flag: T
  readonly args: readonly string[]
  readonly sig: string
  readonly desc: string
  readonly section: string
}[] {
  return withBody(extractItems(extractSectionBody(yo, section), 1)).map(
    item => {
      const sig = normalizeHeader(item.header)
      // Flag sigs from expn.yo can carry colon-delimited operand markers, e.g.
      // `(C:expression:)`: the first segment is the flag name and the middle
      // segments are operand names; the trailing empty segment is dropped.
      const parts = sig.split(":")
      return {
        flag: mkFlag(parts[0] ?? sig),
        args: parts.slice(1, -1).filter(Boolean),
        sig,
        desc: normalizeBody(item.body),
        section,
      }
    },
  )
}
