import { mkDocumented } from "../../brands.ts"
import type { GlobQualifierDoc } from "../../types.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectionBody,
  withBody,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { normalizeBody, ttTexts, varTexts } from "../core/text.ts"
import { flagSigText } from "./flag-section.ts"

/**
 * Parse the "Glob Qualifiers" subsection from `expn.yo`. Shape mirrors
 * `parseGlobFlags` — same `extractItemList`/`extractTokens` machinery — since
 * both categories describe single-letter parametrised flags with optional
 * `var(…)` operand slots.
 */
export function parseGlobQualifiers(
  yo: string | YNodeSeq,
): readonly GlobQualifierDoc[] {
  const section = "Glob Qualifiers"
  const sec = extractSectionBody(yo, section)
  const list = extractFirstList(sec, "item")
  if (!list) return []

  return withBody(extractItemList(list)).flatMap(item => {
    const desc = normalizeBody(item.body)
    const tt = ttTexts(item.header)
    const vars = varTexts(item.header)
    const sig = flagSigText(item.header)

    const [flag = sig] = tt
    return [
      {
        flag: mkDocumented("glob_qualifier", flag),
        args: vars,
        sig,
        desc,
        section,
      } satisfies GlobQualifierDoc,
    ]
  })
}
