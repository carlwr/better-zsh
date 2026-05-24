import { type NonEmpty, nonEmpty } from "@carlwr/typescript-extra"

import { mkDocumented } from "../../brands.ts"
import { type PromptEscapeDoc, promptSubsections } from "../../types.ts"
import {
  collectAliasedEntries,
  extractItems,
  mkClosedUnionParser,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

const parsePromptSubsection = mkClosedUnionParser(
  promptSubsections,
  "prompt-escape subsection",
)

interface PromptHead {
  readonly sig: string
  readonly keys: NonEmpty<string>
}

/**
 * Lookup key is the first whitespace-separated run starting at `%`. "Visual
 * effects" entries pair a starter and stopper glyph in one header (e.g.
 * `item(tt(%F) LPAR()tt(%f)RPAR())`); both glyphs are emitted as separate
 * records sharing one body and the full `%X (%x)` sig.
 */
export function parsePromptEscapes(yo: YodlSrc): readonly PromptEscapeDoc[] {
  const out: PromptEscapeDoc[] = []
  for (const aliased of collectAliasedEntries<PromptHead>(
    extractItems(yo, 1),
    header => {
      const sig = normalizeHeader(header)
      const keys = promptKeys(sig)
      return keys ? { sig, keys } : undefined
    },
  )) {
    const desc = normalizeBody(aliased.entry.body ?? [])
    const section = parsePromptSubsection(aliased.entry.section)
    for (const head of [aliased.head, ...aliased.aliases]) {
      for (const key of head.keys) {
        out.push({
          key: mkDocumented("prompt_escape", key),
          sig: head.sig,
          desc,
          section,
        })
      }
    }
  }
  return out
}

function promptKeys(sig: string): NonEmpty<string> | undefined {
  const paired = sig.match(/^(%\S+)\s+\(\s*(%\S+)\s*\)\s*$/)
  if (paired?.[1] && paired[2]) return nonEmpty(paired[1], paired[2])
  const single = sig.match(/^%\S+/)?.[0]
  return single ? nonEmpty(single) : undefined
}
