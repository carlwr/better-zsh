/**
 * Yodl structure: `findex(zstat) findex(stat)` — both names documented;
 * `xitem(tt(zstat ...)) xitem(SPACES()...) item(tt(stat) ...)(body)` — body
 * on the outer item, xitems are continuations. Options live in a nested
 * startitem (flagGroups). `parseModuleBuiltins` handles the synopsis and
 * flagGroups; we then tag `stat` as `aliasOf: zstat`.
 */
import { mkDocumented } from "../../../brands.ts"
import type { BuiltinDoc } from "../../../types.ts"
import type { YodlSrc } from "../../core/nodes.ts"
import { parseModuleBuiltins } from "./helpers.ts"

const STAT = mkDocumented("builtin", "stat")
const ZSTAT = mkDocumented("builtin", "zstat")

export function extractStat(yo: YodlSrc): readonly BuiltinDoc[] {
  return parseModuleBuiltins(yo, "zsh/stat").map(doc =>
    doc.name === STAT ? { ...doc, aliasOf: ZSTAT } : doc,
  )
}
