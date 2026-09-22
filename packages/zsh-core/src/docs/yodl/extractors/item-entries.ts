/**
 * The nested item list, as every record body encodes it: `ItemEntry` rows
 * whose `sigs` fold in the body-less `xitem` alias headers preceding the
 * body-bearing `item(...)`. One collector for flags, parameter keys and
 * widget sub-items, so the three cannot drift apart again.
 */
import { isNonEmpty, type NonEmpty, nonEmpty } from "@carlwr/typescript-extra"
import type { ItemEntry } from "../../types.ts"
import {
  type AliasedYodlEntry,
  collectAliasedEntries,
  type YodlEntry,
} from "../core/doc.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

/**
 * A nested item list's entries grouped by shared body. Entries whose header
 * normalizes to nothing are dropped, as is a trailing `xitem` chain no
 * `item(...)(body)` terminates.
 */
export function aliasedItems(
  entries: readonly YodlEntry[],
): AliasedYodlEntry<string>[] {
  return collectAliasedEntries(entries, h => normalizeHeader(h) || undefined)
}

/** One group's headers in manual source order — the `xitem` aliases first. */
export function itemSigs(grp: AliasedYodlEntry<string>): NonEmpty<string> {
  // The branch narrows for `NonEmpty`; `[...aliases, head]` alone isn't
  // provably non-empty to TS even though `head` is always present.
  return isNonEmpty(grp.aliases)
    ? [...grp.aliases, grp.head]
    : nonEmpty(grp.head)
}

/** A nested item list as flat entries; no deeper level is lifted. */
export function collectItemEntries(entries: readonly YodlEntry[]): ItemEntry[] {
  return aliasedItems(entries).map(grp => ({
    sigs: itemSigs(grp),
    desc: normalizeBody(grp.entry.body ?? []),
  }))
}
