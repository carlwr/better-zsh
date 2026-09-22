// A nested item list as `ItemEntry` rows, `xitem` alias headers folded in.

import { isNonEmpty, type NonEmpty, nonEmpty } from "@carlwr/typescript-extra"
import type { ItemEntry } from "../../types.ts"
import {
  type AliasedYodlEntry,
  collectAliasedEntries,
  type YodlEntry,
} from "../core/doc.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

/**
 * Entries grouped by shared body. A sig is the whole normalized header, not
 * its first `tt()` token — a composite header (`%F{color} (%f)`) would
 * otherwise lose everything after the first macro.
 */
export function aliasedItems(
  entries: readonly YodlEntry[],
): AliasedYodlEntry<string>[] {
  return collectAliasedEntries(entries, h => normalizeHeader(h) || undefined)
}

/** One group's headers in manual source order — the `xitem` aliases first. */
export function itemSigs(grp: AliasedYodlEntry<string>): NonEmpty<string> {
  // TS cannot see that a spread ending in `head` is non-empty.
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
