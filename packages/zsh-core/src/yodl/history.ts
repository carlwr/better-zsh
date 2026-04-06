import type { HistoryDoc, HistoryKind } from "../types/zsh-data.ts"
import {
  collectAliasedItems,
  extractFirstList,
  extractItemList,
  extractSectionBody,
  extractSitemList,
  normalizeBody,
  normalizeHeader,
} from "./parse.ts"

export function parseHistory(yo: string): HistoryDoc[] {
  return [
    ...parseSection(yo, "Event Designators", "event-designator"),
    ...parseWordDesignators(yo),
    ...parseSection(yo, "Modifiers", "modifier"),
  ]
}

function parseSection(
  yo: string,
  section: string,
  kind: HistoryKind,
): HistoryDoc[] {
  const body = extractSectionBody(yo, section)
  const list = extractFirstList(body, "item")
  if (!list) return []
  const out: HistoryDoc[] = []
  for (const entry of collectAliasedItems(
    extractItemList(list),
    normalizeHeader,
  )) {
    const desc = normalizeBody(entry.item.body ?? "")
    out.push({ kind, key: entry.head, sig: entry.head, desc, section })
    for (const alias of entry.aliases) {
      out.push({ kind, key: alias, sig: alias, desc, section })
    }
  }
  return out
}

function parseWordDesignators(yo: string): HistoryDoc[] {
  const body = extractSectionBody(yo, "Word Designators")
  const list = extractFirstList(body, "sitem")
  if (!list) return []
  return extractSitemList(list).flatMap((item) => {
    if (!item.body) return []
    const sig = normalizeHeader(item.header)
    return [
      {
        kind: "word-designator",
        key: sig,
        sig,
        desc: normalizeBody(item.body),
        section: "Word Designators",
      } satisfies HistoryDoc,
    ]
  })
}
