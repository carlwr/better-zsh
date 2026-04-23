import { mkDocumented } from "../../brands.ts"
import type { GlobQualifierDoc } from "../../types.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectionBody,
  type YodlEntry,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { extractTokens, normalizeBody } from "../core/text.ts"
import { flagSigText } from "./flag-section.ts"

function bodyDoc(item: YodlEntry): string | undefined {
  return item.body ? normalizeBody(item.body) : undefined
}

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

  return extractItemList(list).flatMap(item => {
    const desc = bodyDoc(item)
    if (!desc) return []

    const toks = extractTokens(item.header)
    const tt = toks.filter(tok => tok.kind === "tt").map(tok => tok.text)
    const vars = toks.filter(tok => tok.kind === "var").map(tok => tok.text)
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
