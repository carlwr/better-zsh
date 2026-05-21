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

/**
 * Body split into intro `desc` + (optional) per-group flag lists + outro.
 * Shape shared by every record category whose body carries flag-style nested
 * lists; `flagGroups` reuses the canonical `FlagGroup` type.
 */
export interface SigDescBody {
  readonly desc: string
  readonly flagGroups?: readonly FlagGroup[]
  readonly outro?: string
}

/**
 * Collect `{sig, desc}` pairs from a flat list of `YodlEntry`s. Consecutive
 * `xitem(...)` headers preceding an `item(...)(body)` are folded onto the
 * body-bearing item — each alias and the head become a separate entry sharing
 * the same desc. Entries with empty normalized headers are skipped.
 *
 * Shared by builtins and completion utilities — both surface the same
 * structural shape (depth-1 nested item lists whose entries are flag-shaped).
 */
export function collectSigDescPairs(
  entries: readonly YodlEntry[],
): FlagEntry[] {
  const out: FlagEntry[] = []
  for (const grp of collectAliasedEntries(
    entries,
    h => normalizeHeader(h) || undefined,
  )) {
    const desc = normalizeBody(grp.entry.body ?? [])
    for (const sig of [...grp.aliases, grp.head]) {
      out.push({ sig, desc })
    }
  }
  return out
}

/**
 * Split a record body at each top-level depth-1 nested item list. Most
 * builtins / comp-utils document one flag set; a few (`typeset`,
 * `_arguments`) document multiple sibling lists in the same body. Each list
 * becomes a `FlagGroup` carrying its `{sig, desc}` entries plus the
 * inter-list intro prose (empty for the first group, whose preceding prose
 * is in the returned `desc`).
 *
 * Falls back to a flat `desc` (no flagGroups) when no nested list exists or
 * none of the captured lists contain any sig-bearing entries.
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
