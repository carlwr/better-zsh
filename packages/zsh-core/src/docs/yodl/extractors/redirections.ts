import { mkDocumented } from "../../brands.ts"
import type { RedirDoc } from "../../types.ts"
import { mkRedirOp } from "../../types.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliasedEntries,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { normalizeHeader } from "../core/text.ts"

export function parseRedirs(yo: string | YNodeSeq): readonly RedirDoc[] {
  const section = extractSectionBody(yo, "Redirection")
  return flattenAliasedEntries(
    extractItems(section.length > 0 ? section : yo, 1),
    normalizeHeader,
    (sig, desc) => ({
      groupOp: mkRedirOp(sig.match(/^\S+/)?.[0] ?? sig),
      sig: mkDocumented("redir", sig),
      desc,
      section: "Redirection",
    }),
  )
}
