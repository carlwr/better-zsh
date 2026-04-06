import type { GlobOpDoc } from "../types/zsh-data.ts"
import {
  collectAliasedItems,
  extractItems,
  extractSectionBody,
  normalizeBody,
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
  const out: GlobOpDoc[] = []
  for (const entry of collectAliasedItems(
    extractItems(section, 1),
    normalizeHeader,
  )) {
    const desc = normalizeBody(entry.item.body ?? "")
    out.push({ op: entry.head, sig: entry.head, desc, section: name })
    for (const alias of entry.aliases) {
      out.push({ op: alias, sig: alias, desc, section: name })
    }
  }
  return out
}
