import type { RedirDoc } from "../types/zsh-data.ts"
import {
  extractItems,
  extractSectionBody,
  flattenAliased,
  normalizeHeader,
} from "./parse.ts"

export function parseRedirections(yo: string): RedirDoc[] {
  const section = extractSectionBody(yo, "Redirection") || yo
  return flattenAliased(
    extractItems(section, 1),
    normalizeHeader,
    (sig, desc) => ({
      op: sig.match(/^\S+/)?.[0] ?? sig,
      sig,
      desc,
      section: "Redirection",
    }),
  )
}
