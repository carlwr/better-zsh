import { nonEmpty } from "@carlwr/typescript-extra"

import type { PrecmdDoc } from "../../types.ts"
import { isPrecmdName } from "../../types.ts"
import { extractItems } from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

const SECTION = "Precommand Modifiers"

export function parsePrecmds(yo: YodlSrc): readonly PrecmdDoc[] {
  return extractItems(yo).flatMap(item => {
    if (item.section !== SECTION || !item.body) return []
    const synopsis = normalizeHeader(item.header)
    const name = synopsis.match(/^(\S+)/)?.[1]
    if (!name || !isPrecmdName(name)) return []
    return [
      {
        id: name,
        display: name,
        synopsis: nonEmpty(synopsis),
        desc: normalizeBody(item.body),
      } satisfies PrecmdDoc,
    ]
  })
}
