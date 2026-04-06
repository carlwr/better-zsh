import type { RedirDoc } from "../types/zsh-data.ts"
import {
  collectAliasedItems,
  extractItems,
  extractSectionBody,
  normalizeBody,
  normalizeHeader,
} from "./parse.ts"

export function parseRedirections(yo: string): RedirDoc[] {
  const section = extractSectionBody(yo, "Redirection") || yo
  const out: RedirDoc[] = []

  for (const entry of collectAliasedItems(
    extractItems(section, 1),
    normalizeHeader,
  )) {
    const desc = normalizeBody(entry.item.body ?? "")
    out.push(toDoc(entry.head, desc))
    for (const alias of entry.aliases) out.push(toDoc(alias, desc))
  }

  return out
}

function toDoc(sig: string, desc: string): RedirDoc {
  return {
    op: sig.match(/^\S+/)?.[0] ?? sig,
    sig,
    desc,
    section: "Redirection",
  }
}
