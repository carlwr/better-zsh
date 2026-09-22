import { identity } from "../../brands.ts"
import type { DocCategory } from "../../taxonomy.ts"
import type { DocRecordBase, FlagGroup, SyntaxDocBase } from "../../types.ts"
import {
  extractItems,
  extractSectionBody,
  splitBodyAtAllNestedLists,
  withBody,
} from "../core/doc.ts"
import type { YNodeSeq, YodlSrc } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"
import { collectItemEntries } from "./item-entries.ts"

// Shape shared by every record category whose body carries flag-style nested
// lists.
export interface SigDescBody {
  readonly desc: string
  readonly flagGroups?: readonly FlagGroup[]
  readonly outro?: string
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
    const flags = collectItemEntries(g.entries)
    if (flags.length === 0) continue
    const intro = flagGroups.length === 0 ? "" : normalizeBody(g.preIntro)
    flagGroups.push({ intro, flags })
  }
  if (flagGroups.length === 0) return { desc: normalizeBody(body) }

  const desc = normalizeBody(split.intro)
  const outro = normalizeBody(split.outro)
  return outro ? { desc, flagGroups, outro } : { desc, flagGroups }
}

export function parseFlagSection<K extends DocCategory>(
  yo: YodlSrc,
  section: string,
  cat: K,
): readonly (DocRecordBase<K> &
  SyntaxDocBase & { readonly args: readonly string[] })[] {
  return withBody(extractItems(extractSectionBody(yo, section), 1)).map(
    item => {
      const sig = normalizeHeader(item.header)
      // Flag sigs from expn.yo can carry colon-delimited operand markers, e.g.
      // `(C:expression:)`: the first segment is the flag name and the middle
      // segments are operand names; the trailing empty segment is dropped.
      // The id is the flag name; the display keeps the markers.
      const parts = sig.split(":")
      return {
        ...identity(cat, parts[0] ?? sig, sig),
        args: parts.slice(1, -1).filter(Boolean),
        sig,
        desc: normalizeBody(item.body),
      }
    },
  )
}
