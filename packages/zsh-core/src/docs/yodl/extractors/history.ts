import { identity } from "../../brands.ts"
import type { HistoryExpnDoc, HistoryExpnKind } from "../../types.ts"
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

export function parseHistory(yo: YodlSrc): readonly HistoryExpnDoc[] {
  return [
    ...parseSection(yo, EVENT_SECTION, "event-designator", sigKey),
    ...parseWordDesignators(yo),
    ...parseSection(yo, MOD_SECTION, "modifier", modifierBareKey),
  ]
}

function parseSection(
  yo: YodlSrc,
  section: string,
  kind: HistoryExpnKind,
  toKey: (sig: string) => string,
): HistoryExpnDoc[] {
  return flattenAliasedEntries(
    extractFirstItemList(extractSectionBody(yo, section)),
    normalizeHeader,
    (sig, desc) => ({
      ...identity("history_expn", toKey(sig), sig),
      subKind: kind,
      sig,
      desc,
    }),
  )
}

function parseWordDesignators(yo: YodlSrc): HistoryExpnDoc[] {
  return withBody(
    extractFirstSitemList(extractSectionBody(yo, WORD_DESIG_SECTION)),
  ).map(item => {
    const sig = normalizeHeader(item.header)
    return {
      ...identity("history_expn", sig, sig),
      subKind: "word-designator",
      sig,
      desc: normalizeBody(item.body),
    } satisfies HistoryExpnDoc
  })
}
