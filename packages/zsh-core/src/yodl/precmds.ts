import type { PrecmdDoc, PrecmdName } from "../types/zsh-data.ts"
import { extractItems, normalizeDoc, stripYodl } from "./parse.ts"

const PRECMDS = new Set<PrecmdName>([
  "-",
  "builtin",
  "command",
  "exec",
  "nocorrect",
  "noglob",
])

export function parsePrecmds(yo: string): PrecmdDoc[] {
  return extractItems(yo)
    .filter((item) => item.section === "Precommand Modifiers" && item.body)
    .flatMap((item) => {
      const synopsis = stripYodl(item.header).trim()
      const name = synopsis.match(/^(\S+)/)?.[1]
      if (!item.body || !name || !isPrecmdName(name)) return []
      return [
        {
          name,
          synopsis: [synopsis],
          desc: normalizeDoc(stripYodl(item.body)),
        } satisfies PrecmdDoc,
      ]
    })
}

function isPrecmdName(name: string): name is PrecmdName {
  return PRECMDS.has(name as PrecmdName)
}
