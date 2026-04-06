import type { ParamFlagDoc } from "../types/zsh-data.ts"
import {
  extractItems,
  extractSectionBody,
  normalizeBody,
  normalizeHeader,
} from "./parse.ts"

export function parseParamFlags(yo: string): ParamFlagDoc[] {
  const section = extractSectionBody(yo, "Parameter Expansion Flags")
  return extractItems(section, 1).flatMap((item) => {
    if (!item.body) return []
    const sig = normalizeHeader(item.header)
    const { args } = splitFlag(sig)
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

function splitFlag(sig: string): { flag: string; args: string[] } {
  const parts = sig.split(":")
  return { flag: parts[0] ?? sig, args: parts.slice(1, -1).filter(Boolean) }
}
