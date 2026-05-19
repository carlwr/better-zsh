import { mkDocumented } from "../../brands.ts"
import type { HistoryDoc, HistoryKind } from "../../types.ts"
import {
  extractFirstItemList,
  extractFirstSitemList,
  extractSectionBody,
  flattenAliasedEntries,
  withBody,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

const EVENT_SECTION = "Event Designators"
const MOD_SECTION = "Modifiers"
const WORD_DESIG_SECTION = "Word Designators"

const sigKey = (sig: string) => sig
const modifierBareKey = (sig: string) => /^[A-Za-z&]+/.exec(sig)?.[0] ?? sig

export function parseHistory(yo: YodlSrc): readonly HistoryDoc[] {
  return [
    ...parseSection(yo, EVENT_SECTION, "event-designator", sigKey),
    ...parseWordDesignators(yo),
    ...parseSection(yo, MOD_SECTION, "modifier", modifierBareKey),
  ]
}

function parseSection(
  yo: YodlSrc,
  section: string,
  kind: HistoryKind,
  toKey: (sig: string) => string,
): HistoryDoc[] {
  return flattenAliasedEntries(
    extractFirstItemList(extractSectionBody(yo, section)),
    normalizeHeader,
    (sig, desc) => ({
      kind,
      key: mkDocumented("history_expn", toKey(sig)),
      sig,
      desc,
      section,
    }),
  )
}

function parseWordDesignators(yo: YodlSrc): HistoryDoc[] {
  return withBody(
    extractFirstSitemList(extractSectionBody(yo, WORD_DESIG_SECTION)),
  ).map(item => {
    const sig = normalizeHeader(item.header)
    return {
      kind: "word-designator",
      key: mkDocumented("history_expn", sig),
      sig,
      desc: normalizeBody(item.body),
      section: WORD_DESIG_SECTION,
    } satisfies HistoryDoc
  })
}
