import { mkDocumented } from "../../brands.ts"
import type { RedirDoc } from "../../types.ts"
import { mkRedirOp, redirSlugFromSig } from "../../types.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliasedEntries,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { normalizeHeader } from "../core/text.ts"

const SECTION = "Redirection"

export function parseRedirs(yo: YodlSrc): readonly RedirDoc[] {
  const section = extractSectionBody(yo, SECTION)
  return flattenAliasedEntries(
    extractItems(section.length > 0 ? section : yo, 1),
    normalizeHeader,
    (sig, desc) => ({
      groupOp: mkRedirOp(sig.match(/^\S+/)?.[0] ?? sig),
      slug: mkDocumented("redirection", redirSlugFromSig(sig)),
      sig,
      desc,
      section: SECTION,
    }),
  )
}
