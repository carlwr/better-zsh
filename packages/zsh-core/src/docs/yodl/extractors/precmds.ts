import type { PrecmdDoc } from "../../types.ts"
import { type PrecmdName, precmdNames } from "../../types.ts"
import { extractItems } from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

const SECTION = "Precommand Modifiers"
const PRECMDS: ReadonlySet<string> = new Set(precmdNames)
const isPrecmdName = (s: string): s is PrecmdName => PRECMDS.has(s)

export function parsePrecmds(yo: YodlSrc): readonly PrecmdDoc[] {
  return extractItems(yo).flatMap(item => {
    if (item.section !== SECTION || !item.body) return []
    const synopsis = normalizeHeader(item.header)
    const name = synopsis.match(/^(\S+)/)?.[1]
    if (!name || !isPrecmdName(name)) return []
    return [
      {
        name,
        synopsis: [synopsis],
        desc: normalizeBody(item.body),
      } satisfies PrecmdDoc,
    ]
  })
}
