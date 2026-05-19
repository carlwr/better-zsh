import { mkDocumented } from "../../brands.ts"
import type { CompUtilityDoc } from "../../types.ts"
import { extractSectionBody } from "../core/doc.ts"
import {
  asNodes,
  isMacro,
  macroArg,
  type YNodeSeq,
  type YodlSrc,
} from "../core/nodes.ts"
import { normalizeHeader } from "../core/text.ts"
import { splitFlagBody } from "./flag-section.ts"

interface FindexAssoc {
  /** Function name(s) from findex entries preceding the item. */
  readonly findexNames: readonly string[]
  /**
   * One element per logical synopsis line. xitems whose header begins
   * with the `SPACES()` macro are continuations of the previous line and
   * already folded onto it; the upstream uses SPACES() to indent wrapped
   * forms.
   */
  readonly synopsis: [string, ...string[]]
  readonly body: YNodeSeq
}

const SECTION = "Utility Functions"

export function parseCompUtils(yo: YodlSrc): readonly CompUtilityDoc[] {
  const body = extractSectionBody(asNodes(yo), SECTION)
  const seen = new Set<string>()

  return collectFindexAssociations(body).flatMap(a => {
    const split = splitFlagBody(a.body)
    const sig = a.synopsis[0]
    // Prefer the first underscore-prefixed findex name; fall back to extracting
    // a function name from the sig; last resort: the first findex entry.
    // When findex provides the name, emit one record per findex name
    // (handles `_options_set` / `_options_unset` that share a body).
    const fromFindex = a.findexNames.find(n => n.startsWith("_"))
    const sigName = sig.match(/^(_[a-zA-Z0-9_]+)/)?.[1]
    const primary = fromFindex ?? sigName ?? a.findexNames[0]
    if (!primary) return []

    const names = fromFindex ? a.findexNames : [primary]
    return names.flatMap(n => {
      if (!n || seen.has(n)) return []
      seen.add(n)
      return [
        {
          name: mkDocumented("comp_utility", n),
          sig,
          synopsis: a.synopsis,
          desc: split.desc,
          section: SECTION,
          ...(split.flagGroups && { flagGroups: split.flagGroups }),
          ...(split.outro && { outro: split.outro }),
        } satisfies CompUtilityDoc,
      ]
    })
  })
}

/**
 * Walk top-level nodes in the Utility Functions section, collecting
 * findex-name → user-visible-item associations. xitem entries between
 * findex and the body-bearing item are treated as sig aliases (their
 * combined text becomes the record's sig).
 */
function collectFindexAssociations(body: YNodeSeq): FindexAssoc[] {
  const out: FindexAssoc[] = []
  let findex: string[] = []
  let xitems: YNodeSeq[] = []
  const reset = () => {
    findex = []
    xitems = []
  }

  for (const node of body) {
    if (isMacro(node, "findex")) {
      // strip args in findex like `_regex_words [ -t term ]`
      const name = normalizeHeader(macroArg(node, 0)).replace(/\s*\[.*\]$/, "")
      if (name) findex.push(name)
      continue
    }
    if (isMacro(node, "xitem")) {
      xitems.push(macroArg(node, 0))
      continue
    }
    if (isMacro(node, "redef")) continue

    if (isMacro(node, "item") && node.args.length >= 2) {
      const itemBody = node.args[1] ?? []
      if (findex.length === 0 || itemBody.length === 0) {
        reset()
        continue
      }
      // Build the synopsis from all xitems + the item header. Each
      // xitem/item is one logical synopsis line. xitems whose header begins
      // with the `SPACES()` macro are continuations of the previous line
      // (upstream uses SPACES() to indent wrapped forms); fold them back
      // onto the prior line.
      const lines = buildSynopsisLines([...xitems, node.args[0] ?? []])
      const [first, ...rest] = lines
      if (first) {
        out.push({
          findexNames: [...findex],
          synopsis: [first, ...rest],
          body: itemBody,
        })
      }
      reset()
      continue
    }

    // Any other macro (startitem(), enditem(), startitemize(), etc.) resets
    // the pending findex/xitem run — we've left the entry's outer scope.
    if (node.kind === "macro" && findex.length > 0) reset()
  }

  return out
}

function buildSynopsisLines(headers: readonly YNodeSeq[]): string[] {
  const lines: string[] = []
  for (const header of headers) {
    const text = normalizeHeader(header)
    if (!text) continue
    const first = header[0]
    if (lines.length > 0 && isMacro(first, "SPACES")) {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${text}`
    } else {
      lines.push(text)
    }
  }
  return lines
}
