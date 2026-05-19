import { mkDocumented } from "../../brands.ts"
import type { GlobQualifierDoc } from "../../types.ts"
import {
  extractFirstItemList,
  extractSectionBody,
  withBody,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import {
  normalizeBody,
  normalizeHeader,
  ttTexts,
  varTexts,
} from "../core/text.ts"

const SECTION = "Glob Qualifiers"

/**
 * Parse the "Glob Qualifiers" subsection from `expn.yo`. Shape mirrors
 * `parseGlobFlags` — same `extractFirstItemList`/`extractTokens` machinery —
 * since both categories describe single-letter parametrised flags with
 * optional `var(…)` operand slots.
 */
export function parseGlobQualifiers(yo: YodlSrc): readonly GlobQualifierDoc[] {
  return withBody(extractFirstItemList(extractSectionBody(yo, SECTION))).map(
    item => {
      const sig = normalizeHeader(item.header)
      const [flag = sig] = ttTexts(item.header)
      return {
        flag: mkDocumented("glob_qualifier", flag),
        args: varTexts(item.header),
        sig,
        desc: normalizeBody(item.body),
        section: SECTION,
      } satisfies GlobQualifierDoc
    },
  )
}
