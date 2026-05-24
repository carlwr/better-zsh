import {
  escapeRegExp,
  hasAtleastTwo,
  type NonEmpty,
  nonEmpty,
} from "@carlwr/typescript-extra"
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
  readonly findexNames: readonly string[]
  /**
   * One element per logical synopsis line. xitems beginning with `SPACES()`
   * are continuation lines (upstream uses SPACES() to indent wrapped forms);
   * already folded onto the prior line.
   */
  readonly synopsis: NonEmpty<string>
  readonly body: YNodeSeq
}

const SECTION = "Utility Functions"

export function parseCompUtils(yo: YodlSrc): readonly CompUtilityDoc[] {
  const body = extractSectionBody(asNodes(yo), SECTION)
  const seen = new Set<string>()

  return collectFindexAssociations(body).flatMap(a => {
    const split = splitFlagBody(a.body)
    const sig = a.synopsis[0]
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
      // When multiple findex names share one upstream item, the upstream sig
      // joins them with "and" (e.g. `_options_set and _options_unset`);
      // rewrite to just this record's name so each head is self-consistent.
      const perRecordSig = rewriteSharedSig(sig, n, names)
      const perRecordSynopsis = nonEmpty(
        rewriteSharedSig(a.synopsis[0], n, names),
        ...a.synopsis.slice(1),
      )
      return [
        {
          name: mkDocumented("comp_utility", n),
          sig: perRecordSig,
          synopsis: perRecordSynopsis,
          desc: split.desc,
          section: SECTION,
          ...(split.flagGroups && { flagGroups: split.flagGroups }),
          ...(split.outro && { outro: split.outro }),
        } satisfies CompUtilityDoc,
      ]
    })
  })
}

// xitem entries between findex and the body-bearing item are sig aliases
// (combined text becomes the record's sig).
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

    if (isMacro(node, "item") && hasAtleastTwo(node.args)) {
      const itemBody = node.args[1]
      if (findex.length === 0 || itemBody.length === 0) {
        reset()
        continue
      }
      const lines = buildSynopsisLines([...xitems, node.args[0]])
      const [first, ...rest] = lines
      if (first) {
        out.push({
          findexNames: [...findex],
          synopsis: nonEmpty(first, ...rest),
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

/**
 * For a sig string that names multiple sibling functions joined by "and"
 * (e.g. `_options_set and _options_unset`), reduce it to the part naming
 * the current function. When `sig` doesn't reference the other siblings,
 * pass it through unchanged.
 */
function rewriteSharedSig(
  sig: string,
  current: string,
  allNames: readonly string[],
): string {
  if (allNames.length <= 1) return sig
  const others = allNames.filter(n => n !== current && sig.includes(n))
  if (others.length === 0) return sig
  let out = sig
  for (const o of others) {
    out = out
      .replace(new RegExp(`\\s+and\\s+${escapeRegExp(o)}\\b`), "")
      .replace(new RegExp(`\\b${escapeRegExp(o)}\\s+and\\s+`), "")
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
