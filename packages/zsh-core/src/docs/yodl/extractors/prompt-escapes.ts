import type { NonEmpty } from "@carlwr/typescript-extra"

import { mkDocumented } from "../../brands.ts"
import {
  type PromptEscapeDoc,
  type PromptSubsection,
  promptSubsections,
} from "../../types.ts"
import {
  collectAliasedEntries,
  extractItems,
  parseClosedUnion,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

const PROMPT_SUBSECTION_SET: ReadonlySet<string> = new Set(promptSubsections)

interface PromptHead {
  readonly sig: string
  readonly keys: NonEmpty<string>
}

/**
 * Parse prompt expansion escapes from `prompt.yo`.
 *
 * Entries are `item(tt(%X))(desc)` / `xitem(tt(%X))` pairs across several
 * subsections (Special characters, Login information, Shell state, Date and
 * time, Visual effects, Conditional Substrings in Prompts). Header-sig is the
 * rendered header text (e.g. `%n`, `%D{string}`, `%B (%b)`); lookup key is
 * the first whitespace-separated run starting at `%`.
 *
 * "Visual effects" entries pair a starter and stopper glyph in one header,
 * e.g. `item(tt(%F) LPAR()tt(%f)RPAR())`. Both glyphs are emitted as
 * separate records sharing one body chunk and the full `%X (%x)` sig.
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

function parsePromptSubsection(raw: string): PromptSubsection {
  return parseClosedUnion(
    raw,
    PROMPT_SUBSECTION_SET,
    "prompt-escape subsection",
  )
}

/**
 * Extract the `%X` lookup keys from a rendered prompt-escape header.
 *
 * Returns one key for solo headers, two for the inline-paired
 * `%X (%x)` form used in "Visual effects".
 */
function promptKeys(sig: string): NonEmpty<string> | undefined {
  const paired = sig.match(/^(%\S+)\s+\(\s*(%\S+)\s*\)\s*$/)
  if (paired?.[1] && paired[2]) return [paired[1], paired[2]]
  const single = sig.match(/^%\S+/)?.[0]
  return single ? [single] : undefined
}
