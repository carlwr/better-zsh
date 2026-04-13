import type { GlobOpDoc } from "../../types.ts"
import { mkProven } from "../../types.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliasedEntries,
} from "../core/doc.ts"
import { normalizeHeader } from "../core/text.ts"

export function parseGlobOps(yo: string): readonly GlobOpDoc[] {
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
    (op, desc) => ({
      op: mkProven("glob_op", op),
      sig: op,
      desc,
      section: name,
    }),
  )
}
