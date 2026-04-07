import type { GlobOpDoc } from "../types/zsh-data.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliased,
  normalizeHeader,
} from "./parse.ts"

export function parseGlobOps(yo: string): GlobOpDoc[] {
  return [
    ...parseSection(extractSectionBody(yo, "Glob Operators"), "Glob Operators"),
    ...parseSection(
      extractSectionBody(yo, "ksh-like Glob Operators"),
      "ksh-like Glob Operators",
    ),
  ]
}

function parseSection(section: string, name: string): GlobOpDoc[] {
  return flattenAliased(
    extractItems(section, 1),
    normalizeHeader,
    (op, desc) => ({ op, sig: op, desc, section: name }),
  )
}
