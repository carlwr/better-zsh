import type { ParamFlagDoc } from "../types/zsh-data.ts"
import {
  extractItems,
  extractSectionBody,
  normalizeBody,
  normalizeHeader,
} from "./parse.ts"
import { splitFlagSig } from "./syntax.ts"

export function parseParamFlags(yo: string): ParamFlagDoc[] {
  const section = extractSectionBody(yo, "Parameter Expansion Flags")
  return extractItems(section, 1).flatMap((item) => {
    if (!item.body) return []
    const sig = normalizeHeader(item.header)
    const { args } = splitFlagSig(sig)
    return [
      {
        flag: sig,
        args,
        sig,
        desc: normalizeBody(item.body),
        section: "Parameter Expansion Flags",
      },
    ]
  })
}
