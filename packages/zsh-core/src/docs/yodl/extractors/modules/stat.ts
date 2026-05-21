/**
 * mod_stat.yo: zstat builtin with `stat` as aliasOf, heavy option list.
 *
 * The yodl structure uses:
 * - `findex(zstat) findex(stat)` — both names documented
 * - `xitem(tt(zstat ...) xitem(SPACES()...) item(tt(stat) ...)(body)` — the
 *   outer item has body, xitems are continuations
 *
 * The options are inside a nested startitem block (flagGroups).
 * `parseModuleBuiltins` handles the synopsis and flagGroups via splitFlagBody.
 * We then tag `stat` as `aliasOf: "zstat"`.
 */

import { mkDocumented } from "../../../brands.ts"
import type { BuiltinDoc } from "../../../types.ts"
import type { YodlSrc } from "../../core/nodes.ts"
import { parseModuleBuiltins } from "./helpers.ts"

// Both `findex(zstat)` and `findex(stat)` appear as separate item heads in
// mod_stat.yo, so the parser emits two records. Canonical name is `zstat`;
// `stat` gets `aliasOf: zstat`.
const STAT = mkDocumented("builtin", "stat")
const ZSTAT = mkDocumented("builtin", "zstat")

export function extractStat(yo: YodlSrc): readonly BuiltinDoc[] {
  return parseModuleBuiltins(yo, "zsh/stat").map(doc =>
    doc.name === STAT ? { ...doc, aliasOf: ZSTAT } : doc,
  )
}
