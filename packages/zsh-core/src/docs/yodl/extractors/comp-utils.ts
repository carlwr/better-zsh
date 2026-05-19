import { mkDocumented } from "../../brands.ts"
import type { CompUtilityDoc } from "../../types.ts"
import { extractSectionBody } from "../core/doc.ts"
import { isMacro, macroArg, parseNodes, type YNodeSeq } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

interface FindexAssoc {
  /** Function name(s) from findex entries preceding the item. */
  readonly findexNames: readonly string[]
  /** First xitem header if any xitems exist, otherwise the item header. */
  readonly sig: string
  readonly body: YNodeSeq
}

export function parseCompUtils(
  yo: string | YNodeSeq,
): readonly CompUtilityDoc[] {
  const nodes = typeof yo === "string" ? parseNodes(yo) : yo
  const section = "Utility Functions"
  const body = extractSectionBody(nodes, section)
  const assocs = collectFindexAssociations(body)
  const seen = new Set<string>()

  return assocs.flatMap(a => {
    const desc = normalizeBody(a.body)
    const sig = a.sig
    // Determine the record's name. Prefer the first underscore-prefixed
    // findex name; fall back to extracting a function name from the sig;
    // last resort: the first findex entry. When findex provides the name,
    // emit one record per findex name (handles _options_set / _options_unset
    // that share a body).
    const fromFindex = findexFuncName(a.findexNames)
    const sigName = extractFuncName(a.sig)
    const primary = fromFindex ?? sigName ?? a.findexNames[0]
    if (!primary) return []
    const names = fromFindex
      ? a.findexNames // use findex names as-is (they may list multiple)
      : [primary]
    return names.flatMap(n => {
      if (!n || seen.has(n)) return []
      seen.add(n)
      return [
        {
          name: mkDocumented("comp_utility", n),
          sig,
          desc,
          section,
        } satisfies CompUtilityDoc,
      ]
    })
  })
}

/** First findex name that looks like a function name (starts with `_`). */
function findexFuncName(findexNames: readonly string[]): string | undefined {
  return findexNames.find(n => /^_/.test(n))
}

function extractFuncName(sig: string): string | undefined {
  const m = sig.match(/^(_[a-zA-Z0-9_]+)/)
  return m?.[1]
}

/**
 * Walk top-level nodes in the Utility Functions section, collecting
 * findex-name → user-visible-item associations. xitem entries between
 * findex and the body-carrying item are treated as sig aliases (their
 * combined text becomes the record's sig).
 */
function collectFindexAssociations(body: YNodeSeq): FindexAssoc[] {
  const out: FindexAssoc[] = []
  let pendingFindex: string[] = []
  let pendingXitems: YNodeSeq[] = []

  for (const node of body) {
    if (isMacro(node, "findex")) {
      const name = normalizeHeader(macroArg(node, 0)).replace(/\s*\[.*\]$/, "") // strip args in findex like `_regex_words [ -t term ]`
      if (name) pendingFindex.push(name)
      continue
    }
    if (isMacro(node, "xitem")) {
      pendingXitems.push(macroArg(node, 0))
      continue
    }
    if (isMacro(node, "redef")) continue
    if (isMacro(node, "item") && node.args.length >= 2) {
      if (pendingFindex.length === 0) {
        pendingXitems = []
        continue
      }
      const itemHeader = node.args[0] ?? []
      const itemBody = node.args[1] ?? []
      if (!itemBody || itemBody.length === 0) {
        pendingXitems = []
        continue
      }

      // Build sig from all xitems + the item header
      const sigParts = [...pendingXitems, itemHeader].map(h =>
        normalizeHeader(h),
      )
      const sig = sigParts.join(" ")

      out.push({
        findexNames: [...pendingFindex],
        sig,
        body: itemBody,
      })

      pendingFindex = []
      pendingXitems = []
      continue
    }
    // Any non-ignored macro resets state (e.g. startitem(), enditem(),
    // startitemize() inside _arguments body)
    if (
      node.kind === "macro" &&
      !["findex", "xitem", "redef"].includes(node.name) &&
      pendingFindex.length > 0
    ) {
      pendingFindex = []
      pendingXitems = []
    }
  }

  return out
}
