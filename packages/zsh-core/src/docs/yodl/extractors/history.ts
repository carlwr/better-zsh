import { mkDocumented } from "../../brands.ts"
import type { HistoryDoc, HistoryKind } from "../../types.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectionBody,
  extractSitemList,
  flattenAliasedEntries,
  withBody,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

export function parseHistory(yo: string | YNodeSeq): readonly HistoryDoc[] {
  return [
    ...parseSection(yo, "Event Designators", "event-designator"),
    ...parseWordDesignators(yo),
    ...parseSection(yo, "Modifiers", "modifier"),
  ]
}

function parseSection(
  yo: string | YNodeSeq,
  section: string,
  kind: HistoryKind,
): HistoryDoc[] {
  const body = extractSectionBody(yo, section)
  const list = extractFirstList(body, "item")
  if (!list) return []
  return flattenAliasedEntries(
    extractItemList(list),
    normalizeHeader,
    (sig, desc) => ({
      kind,
      key: mkDocumented(
        "history_expn",
        kind === "modifier" ? modifierBareKey(sig) : sig,
      ),
      sig,
      desc,
      section,
    }),
  )
}

function modifierBareKey(sig: string): string {
  return /^[A-Za-z&]+/.exec(sig)?.[0] ?? sig
}

function parseWordDesignators(yo: string | YNodeSeq): HistoryDoc[] {
  const body = extractSectionBody(yo, "Word Designators")
  const list = extractFirstList(body, "sitem")
  if (!list) return []
  return withBody(extractSitemList(list)).map(item => {
    const sig = normalizeHeader(item.header)
    return {
      kind: "word-designator",
      key: mkDocumented("history_expn", sig),
      sig,
      desc: normalizeBody(item.body),
      section: "Word Designators",
    } satisfies HistoryDoc
  })
}
