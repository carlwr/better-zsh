import type { HistoryDoc, HistoryKind } from "../../types/zsh-data.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectionBody,
  extractSitemList,
  flattenAliasedEntries,
} from "../core/doc.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

export function parseHistory(yo: string): HistoryDoc[] {
  return [
    ...parseSection(yo, "Event Designators", "event-designator"),
    ...parseWordDesignators(yo),
    ...parseSection(yo, "Modifiers", "modifier"),
  ]
}

function parseSection(
  yo: Parameters<typeof extractSectionBody>[0],
  section: string,
  kind: HistoryKind,
): HistoryDoc[] {
  const body = extractSectionBody(yo, section)
  const list = extractFirstList(body, "item")
  if (!list) return []
  return flattenAliasedEntries(
    extractItemList(list),
    normalizeHeader,
    (key, desc) => ({ kind, key, sig: key, desc, section }),
  )
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
