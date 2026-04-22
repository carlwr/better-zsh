import { mkDocumented } from "../../brands.ts"
import type { GlobOpDoc, GlobOpKind } from "../../types.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliasedEntries,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { normalizeHeader } from "../core/text.ts"

export function parseGlobOps(yo: string | YNodeSeq): readonly GlobOpDoc[] {
  return [
    ...parseSection(
      extractSectionBody(yo, "Glob Operators"),
      "Glob Operators",
      "standard",
    ),
    ...parseSection(
      extractSectionBody(yo, "ksh-like Glob Operators"),
      "ksh-like Glob Operators",
      "ksh-like",
    ),
  ]
}

function parseSection(
  section: Parameters<typeof extractItems>[0],
  name: string,
  kind: GlobOpKind,
): GlobOpDoc[] {
  return flattenAliasedEntries(
    extractItems(section, 1),
    normalizeHeader,
    (op, desc) => ({
      op: mkDocumented("glob_op", op),
      sig: op,
      desc,
      section: name,
      kind,
    }),
  )
}
