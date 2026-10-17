import { identity, redirSlugFromSig } from "../../brands.ts"
import type { RedirectionDoc } from "../../types.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliasedEntries,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { normalizeHeader } from "../core/text.ts"

const SECTION = "Redirection"

export function parseRedirs(yo: YodlSrc): readonly RedirectionDoc[] {
  const section = extractSectionBody(yo, SECTION)
  return flattenAliasedEntries(
    extractItems(section.length > 0 ? section : yo, 1),
    normalizeHeader,
    (sig, desc) => ({
      ...identity("redirection", redirSlugFromSig(sig), sig),
      groupOp: sig.match(/^\S+/)?.[0] ?? sig,
      sig,
      desc,
    }),
  )
}
