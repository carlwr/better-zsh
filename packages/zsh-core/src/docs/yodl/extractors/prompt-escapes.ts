import { mkDocumented } from "../../brands.ts"
import {
  type PromptEscapeDoc,
  type PromptSubsection,
  promptSubsections,
} from "../../types.ts"
import {
  extractItems,
  flattenAliasedEntries,
  parseClosedUnion,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { normalizeHeader } from "../core/text.ts"

const PROMPT_SUBSECTION_SET: ReadonlySet<string> = new Set(promptSubsections)

/**
 * Parse prompt expansion escapes from `prompt.yo`.
 *
 * Entries are `item(tt(%X))(desc)` / `xitem(tt(%X))` pairs across several
 * subsections (Special characters, Login information, Shell state, Date and
 * time, Visual effects, Conditional Substrings in Prompts). Header-sig is the
 * rendered header text (e.g. `%n`, `%D{string}`, `%B (%b)`); lookup key is
 * the first whitespace-separated run starting at `%`.
 */
export function parsePromptEscapes(
  yo: string | YNodeSeq,
): readonly PromptEscapeDoc[] {
  return flattenAliasedEntries(
    extractItems(yo, 1),
    header => {
      const sig = normalizeHeader(header)
      const key = promptKey(sig)
      return key ? { sig, key } : undefined
    },
    ({ sig, key }, desc, entry) => ({
      key: mkDocumented("prompt_escape", key),
      sig,
      desc,
      section: parsePromptSubsection(entry.section),
    }),
  )
}

function parsePromptSubsection(raw: string): PromptSubsection {
  return parseClosedUnion(
    raw,
    PROMPT_SUBSECTION_SET,
    "prompt-escape subsection",
  )
}

/** Extract the `%X` lookup key from a rendered prompt-escape header. */
function promptKey(sig: string): string {
  const m = sig.match(/^%\S+/)
  if (!m) return ""
  return m[0]
}
