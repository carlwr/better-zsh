import type { GlobOpDoc } from "../../types/zsh-data.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliasedEntries,
} from "../core/doc.ts"
import { normalizeHeader } from "../core/text.ts"

export function parseGlobOps(yo: string): GlobOpDoc[] {
  return [
    ...parseSection(extractSectionBody(yo, "Glob Operators"), "Glob Operators"),
    ...parseSection(
      extractSectionBody(yo, "ksh-like Glob Operators"),
      "ksh-like Glob Operators",
    ),
  ]
}

function parseSection(
  section: Parameters<typeof extractItems>[0],
  name: string,
): GlobOpDoc[] {
  return flattenAliasedEntries(
    extractItems(section, 1),
    normalizeHeader,
    (op, desc) => ({ op, sig: op, desc, section: name }),
  )
}
