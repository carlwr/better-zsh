import { mkDocumented } from "../../brands.ts"
import type { GlobFlagDoc } from "../../types.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectionBody,
  withBody,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { normalizeBody, ttTexts, varTexts } from "../core/text.ts"
import { flagSigText } from "./flag-section.ts"

export function parseGlobFlags(yo: string | YNodeSeq): readonly GlobFlagDoc[] {
  const section = "Globbing Flags"
  const sec = extractSectionBody(yo, "Globbing Flags")
  const list = extractFirstList(sec, "item")
  if (!list) return []

  return withBody(extractItemList(list)).flatMap(item => {
    const desc = normalizeBody(item.body)
    const tt = ttTexts(item.header)
    const vars = varTexts(item.header)
    const sig = flagSigText(item.header)

    if (vars.length === 0 && tt.length > 1) {
      return tt.map(
        flag =>
          ({
            flag: mkDocumented("glob_flag", flag),
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
        flag: mkDocumented("glob_flag", flag),
        args: vars,
        sig,
        desc,
        section,
      } satisfies GlobFlagDoc,
    ]
  })
}
