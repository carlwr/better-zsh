import { mkDocumented } from "../../brands.ts"
import type { GlobOpDoc, GlobOpKind } from "../../types.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliasedEntries,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { normalizeHeader } from "../core/text.ts"

const STD_SECTION = "Glob Operators"
const KSH_SECTION = "ksh-like Glob Operators"

export function parseGlobOps(yo: YodlSrc): readonly GlobOpDoc[] {
  return [
    ...parseSection(
      extractSectionBody(yo, STD_SECTION),
      STD_SECTION,
      "standard",
    ),
    ...parseSection(
      extractSectionBody(yo, KSH_SECTION),
      KSH_SECTION,
      "ksh-like",
    ),
  ]
}

function parseSection(
  section: YodlSrc,
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
