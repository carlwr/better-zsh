/**
 * Shared body-splitting for `ShellParamDoc.keys` — the nested key-list shape
 * is identical across special-param extractors.
 *
 * Key sigs come from full `normalizeHeader(header)`, not just the first
 * `tt()` token: catches composite headers like WATCHFMT's
 * `tt(%F{)var(color)tt(}) LPAR()tt(%f)RPAR()` whose rendered sig is
 * `%F{color} (%f)` (first-tt would drop everything after `{`). For simple
 * single-tt headers the two agree.
 */
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

// Captures depth-1 nested item list inside the body (depth-2 from the
// param's POV — e.g. `compstate.context`) as `values`. Deeper nesting
// is not captured.
function buildKey(sigs: ItemEntry["sigs"], body: YNodeSeq): ShellParamKey {
  const inner = splitBodyAtNestedList(body)
  if (!inner) return { sigs, desc: normalizeBody(body) }
  const values = collectItemEntries(inner.entries)
  if (values.length === 0) return { sigs, desc: normalizeBody(body) }
  return { sigs, desc: normalizeBody(inner.intro), values }
}
