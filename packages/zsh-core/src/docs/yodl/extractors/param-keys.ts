/**
 * Shared body-splitting for `ShellParamDoc.keys`. Used by both core and
 * module special-params extraction; the nested key-list shape is identical.
 *
 * Key sigs come from full `normalizeHeader(header)`, not just the first
 * `tt()` token: catches composite headers like WATCHFMT's
 * `tt(%F{)var(color)tt(}) LPAR()tt(%f)RPAR()` whose rendered sig is
 * `%F{color} (%f)` (first-tt would drop everything after `{`). For simple
 * single-tt headers the two agree.
 */
import {
  mkShellParamKeyName,
  type ShellParamKey,
  type ShellParamKeyValue,
} from "../../types.ts"
import { splitBodyAtNestedList } from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

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
  const keys: ShellParamKey[] = []
  for (const entry of split.entries) {
    const headerSig = normalizeHeader(entry.header)
    if (!headerSig || !entry.body) continue
    keys.push(buildKey(headerSig, entry.body))
  }
  if (keys.length === 0) return { desc: normalizeBody(body) }
  const desc = normalizeBody(split.intro)
  const outro = normalizeBody(split.outro)
  return outro ? { desc, keys, outro } : { desc, keys }
}

// Captures depth-1 nested item list inside the body (depth-2 from the
// param's POV — e.g. `compstate.context`) as `values`. Deeper nesting
// is not captured.
function buildKey(sig: string, body: YNodeSeq): ShellParamKey {
  const name = mkShellParamKeyName(sig)
  const inner = splitBodyAtNestedList(body)
  if (!inner) return { name, desc: normalizeBody(body) }
  const values: ShellParamKeyValue[] = []
  for (const entry of inner.entries) {
    const vSig = normalizeHeader(entry.header)
    if (!vSig || !entry.body) continue
    values.push({
      name: mkShellParamKeyName(vSig),
      desc: normalizeBody(entry.body),
    })
  }
  if (values.length === 0) return { name, desc: normalizeBody(body) }
  return { name, desc: normalizeBody(inner.intro), values }
}
