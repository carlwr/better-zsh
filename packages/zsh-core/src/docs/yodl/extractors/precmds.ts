import type { NonEmpty } from "@carlwr/typescript-extra"
import type { PrecmdDoc } from "../../types.ts"
import { type PrecmdName, precmdNames } from "../../types.ts"
import { extractItems } from "../core/doc.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

const PRECMDS = new Set<PrecmdName>(precmdNames)

export function parsePrecmds(yo: string): readonly PrecmdDoc[] {
  return extractItems(yo)
    .filter((item) => item.section === "Precommand Modifiers" && item.body)
    .flatMap((item) => {
      const synopsis = normalizeHeader(item.header)
      const name = synopsis.match(/^(\S+)/)?.[1]
      if (!item.body || !name || !isPrecmdName(name)) return []
      const synopses: NonEmpty<string> = [synopsis]
      return [
        {
          name,
          synopsis: synopses,
          desc: normalizeBody(item.body),
        } satisfies PrecmdDoc,
      ]
    })
}

function isPrecmdName(name: string): name is PrecmdName {
  return PRECMDS.has(name as PrecmdName)
}
