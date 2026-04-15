import type { GlobFlagDoc } from "../../types.ts"
import { mkProven } from "../../types.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectionBody,
  type YodlEntry,
} from "../core/doc.ts"
import { extractTokens, normalizeBody } from "../core/text.ts"
import { flagSigText } from "./flag-section.ts"

function bodyDoc(item: YodlEntry): string | undefined {
  return item.body ? normalizeBody(item.body) : undefined
}

export function parseGlobFlags(yo: string): readonly GlobFlagDoc[] {
  const section = "Globbing Flags"
  const sec = extractSectionBody(yo, "Globbing Flags")
  const list = extractFirstList(sec, "item")
  if (!list) return []

  return extractItemList(list).flatMap(item => {
    const desc = bodyDoc(item)
    if (!desc) return []

    const toks = extractTokens(item.header)
    const tt = toks.filter(tok => tok.kind === "tt").map(tok => tok.text)
    const vars = toks.filter(tok => tok.kind === "var").map(tok => tok.text)
    const sig = flagSigText(item.header)

    if (vars.length === 0 && tt.length > 1) {
      return tt.map(
        flag =>
          ({
            flag: mkProven("glob_flag", flag),
            args: [],
            sig: flag,
            desc,
            section,
          }) satisfies GlobFlagDoc,
      )
    }

    const [flag = sig] = tt
    return [
      {
        flag: mkProven("glob_flag", flag),
        args: vars,
        sig,
        desc,
        section,
      } satisfies GlobFlagDoc,
    ]
  })
}
