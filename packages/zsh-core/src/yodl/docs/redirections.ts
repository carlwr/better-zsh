import { mkRedirOp, mkRedirSig } from "../../types/brand.ts"
import type { RedirDoc } from "../../types/zsh-data.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliasedEntries,
} from "../core/doc.ts"
import { normalizeHeader } from "../core/text.ts"

export function parseRedirections(yo: string): readonly RedirDoc[] {
  const section = extractSectionBody(yo, "Redirection")
  return flattenAliasedEntries(
    extractItems(section.length > 0 ? section : yo, 1),
    normalizeHeader,
    (sig, desc) => ({
      groupOp: mkRedirOp(sig.match(/^\S+/)?.[0] ?? sig),
      sig: mkRedirSig(sig),
      desc,
      section: "Redirection",
    }),
  )
}
