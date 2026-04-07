import type { SubscriptFlagDoc } from "../types/zsh-data.ts"
import {
  extractItems,
  extractSectionBody,
  normalizeBody,
  normalizeHeader,
} from "./parse.ts"
import { splitFlagSig } from "./syntax.ts"

export function parseSubscriptFlags(yo: string): SubscriptFlagDoc[] {
  const section = extractSectionBody(yo, "Subscript Flags")
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
        section: "Subscript Flags",
      },
    ]
  })
}
