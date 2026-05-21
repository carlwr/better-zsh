/**
 * Shared body-splitting for `ShellParamDoc.keys`.
 *
 * Used by both core shell-params extraction (params.yo / zle.yo / compwid.yo)
 * and module special-params extraction (mod_*.yo). The two callers differ in
 * how they tag the outer record (the latter sets `module`), but the nested
 * key-list shape is identical.
 *
 * Key sigs come from `normalizeHeader(header)` — the FULL header text, not
 * just the first `tt()` token. This catches composite headers like WATCHFMT's
 * `tt(%F{)var(color)tt(}) LPAR()tt(%f)RPAR()` whose rendered sig is
 * `%F{color} (%f)`; the first-tt approach would drop everything after `{`.
 * For simple single-tt headers (the common case, e.g. `compstate.context`'s
 * value list), `normalizeHeader` returns the same string as the first tt.
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
 * Split a parameter's item-body into intro prose, an enumerated nested
 * key-list (if present), and any post-list outro prose. Keys are emitted
 * only when the body contains a depth-1 `startitem()`/`enditem()` block.
 *
 * Records observed in the vendored corpus have only intro+list (no outro);
 * the outro path is precautionary so the renderer can place the key
 * headings between intro and outro consistently with builtins / comp-utils.
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

/**
 * Build one `ShellParamKey` from a sig + body. If the body contains its own
 * depth-1 nested item list (depth-2 from the param's POV — e.g.
 * `compstate.context` whose value enumerates `array_value`, ...), capture
 * the inner items as `values` and use the pre-list prose as `desc`.
 * Deeper nesting is not captured.
 */
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
