// Body-splitting for `ShellParamDoc.keys`; the nested key-list shape is
// identical across special-param extractors.

import type { ItemEntry, ShellParamKey } from "../../types.ts"
import { splitBodyAtNestedList } from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { normalizeBody } from "../core/text.ts"
import { aliasedItems, collectItemEntries, itemSigs } from "./item-entries.ts"

export interface SplitParamBody {
  readonly desc: string
  readonly keys?: readonly ShellParamKey[]
  readonly outro?: string
}

/**
 * Keys are emitted only when the body contains a depth-1
 * `startitem()`/`enditem()` block. Observed corpus records have intro+list
 * only (no outro); the outro path is precautionary.
 */
export function splitParamBody(body: YNodeSeq): SplitParamBody {
  const split = splitBodyAtNestedList(body)
  if (!split) return { desc: normalizeBody(body) }
  const keys = aliasedItems(split.entries).map(grp =>
    buildKey(itemSigs(grp), grp.entry.body ?? []),
  )
  if (keys.length === 0) return { desc: normalizeBody(body) }
  const desc = normalizeBody(split.intro)
  const outro = normalizeBody(split.outro)
  return outro ? { desc, keys, outro } : { desc, keys }
}

function buildKey(sigs: ItemEntry["sigs"], body: YNodeSeq): ShellParamKey {
  const inner = splitBodyAtNestedList(body)
  if (!inner) return { sigs, desc: normalizeBody(body) }
  const values = collectItemEntries(inner.entries)
  if (values.length === 0) return { sigs, desc: normalizeBody(body) }
  return { sigs, desc: normalizeBody(inner.intro), values }
}
