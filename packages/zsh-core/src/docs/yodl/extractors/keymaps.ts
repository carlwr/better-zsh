import { mkDocumented } from "../../brands.ts"
import type { KeymapDoc } from "../../types.ts"
import {
  extractFirstList,
  extractSectBody,
  extractSitemList,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { firstTt, normalizeBody } from "../core/text.ts"

const SECTION = "Keymaps"

/**
 * Parse ZLE keymaps from `zle.yo` §"Keymaps".
 *
 * Records are the eight initial keymaps declared in a `startsitem()` block:
 * `emacs`, `viins`, `vicmd`, `viopp`, `visual`, `isearch`, `command`,
 * `.safe`. `main` is not its own keymap but an alias to `emacs` (default) or
 * `viins` (vi emulation); represented via `linkedFrom: ["main"]` on `emacs`.
 * `.safe` gets `isSpecial: true` — upstream prose marks it as immutable.
 */
export function parseKeymaps(yo: string | YNodeSeq): readonly KeymapDoc[] {
  const body = extractSectBody(yo, SECTION)
  const list = extractFirstList(body, "sitem")
  if (!list) return []

  const out: KeymapDoc[] = []
  for (const item of extractSitemList(list)) {
    if (!item.body) continue
    const name = firstTt(item.header)?.trim()
    if (!name) continue
    const isSpecial = name === ".safe"
    const linkedFrom = name === "emacs" ? ["main"] : []
    out.push({
      name: mkDocumented("keymap", name),
      sig: name,
      desc: normalizeBody(item.body),
      section: SECTION,
      isSpecial,
      linkedFrom,
    })
  }
  return out
}
