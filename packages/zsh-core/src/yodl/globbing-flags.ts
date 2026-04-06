import type { GlobbingFlagDoc } from "../types/zsh-data.ts"
import {
  extractFirstList,
  extractItemList,
  extractSection,
  extractTokens,
} from "./parse.ts"
import { bodyDoc } from "./shared.ts"
import { sigText } from "./syntax.ts"

export function parseGlobbingFlags(yo: string): GlobbingFlagDoc[] {
  const sec = extractSection(yo, "Globbing Flags")
  const list = sec && extractFirstList(sec, "item")
  if (!list) return []

  return extractItemList(list).flatMap((item) => {
    const desc = bodyDoc(item)
    if (!desc) return []

    const toks = extractTokens(item.header)
    const tt = toks.filter((tok) => tok.kind === "tt").map((tok) => tok.text)
    const vars = toks.filter((tok) => tok.kind === "var").map((tok) => tok.text)
    const sig = sigText(item.header)

    if (vars.length === 0 && tt.length > 1) {
      return tt.map(
        (flag) =>
          ({
            flag,
            args: [],
            sig: flag,
            desc,
            section: item.section,
          }) satisfies GlobbingFlagDoc,
      )
    }

    const [flag = sig] = tt
    return [
      {
        flag,
        args: vars,
        sig,
        desc,
        section: item.section,
      } satisfies GlobbingFlagDoc,
    ]
  })
}
