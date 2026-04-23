import { mkDocumented } from "../../brands.ts"
import type { SpecialFunctionDoc, SpecialFunctionKind } from "../../types.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectionBody,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { extractTokens, normalizeBody, normalizeHeader } from "../core/text.ts"

// `func.yo` §"Special Functions" has two subsections; items live in each.
const HOOK_SECTION = "Hook Functions"
const TRAP_SECTION = "Trap Functions"

/**
 * Parse zsh "special functions" from `func.yo` §"Special Functions".
 *
 * Two subsections contribute:
 * - `Hook Functions`: chpwd, periodic, precmd, preexec, zshaddhistory, zshexit.
 *   Each has a companion `${name}_functions` array; populated into `hookArray`.
 * - `Trap Functions`: the `TRAPNAL` template plus TRAPDEBUG, TRAPEXIT,
 *   TRAPZERR, TRAPERR. The template header is `tt(TRAP)var(NAL)`; its
 *   corpus id is the literal string `TRAPNAL`.
 */
export function parseSpecialFunctions(
  yo: string | YNodeSeq,
): readonly SpecialFunctionDoc[] {
  return [...parseHooks(yo), ...parseTraps(yo)]
}

function parseHooks(yo: string | YNodeSeq): SpecialFunctionDoc[] {
  const list = extractFirstList(extractSectionBody(yo, HOOK_SECTION), "item")
  if (!list) return []
  return extractItemList(list).flatMap(item => {
    if (!item.body) return []
    const name = firstTt(item.header)
    if (!name) return []
    return [
      {
        name: mkDocumented("special_function", name),
        sig: normalizeHeader(item.header),
        desc: normalizeBody(item.body),
        section: HOOK_SECTION,
        kind: "hook" satisfies SpecialFunctionKind,
        hookArray: `${name}_functions`,
      },
    ]
  })
}

function parseTraps(yo: string | YNodeSeq): SpecialFunctionDoc[] {
  const list = extractFirstList(extractSectionBody(yo, TRAP_SECTION), "item")
  if (!list) return []
  return extractItemList(list).flatMap(item => {
    if (!item.body) return []
    const sig = normalizeHeader(item.header)
    const { name, kind } = trapIdentity(item.header, sig)
    if (!name) return []
    return [
      {
        name: mkDocumented("special_function", name),
        sig,
        desc: normalizeBody(item.body),
        section: TRAP_SECTION,
        kind,
      },
    ]
  })
}

// Trap header shapes:
//   tt(TRAP)var(NAL)   -> name=TRAPNAL, kind=trap-template
//   tt(TRAPDEBUG)      -> name=TRAPDEBUG, kind=trap-literal
//   tt(TRAPZERR)       -> name=TRAPZERR, kind=trap-literal (TRAPERR alias via xitem)
function trapIdentity(
  header: Parameters<typeof extractTokens>[0],
  sig: string,
): { name: string; kind: SpecialFunctionKind } {
  const toks = extractTokens(header)
  const hasVar = toks.some(t => t.kind === "var")
  const tt = toks.find(t => t.kind === "tt")?.text.trim() ?? ""
  if (hasVar) return { name: `${tt}NAL`, kind: "trap-template" }
  // Direct sig starts at TRAP for all non-template trap entries; strip any
  // non-word cruft.
  const literal = sig.trim().match(/^TRAP[A-Z0-9]+/)?.[0] ?? tt
  return { name: literal, kind: "trap-literal" }
}

function firstTt(header: Parameters<typeof extractTokens>[0]): string {
  return (
    extractTokens(header)
      .find(t => t.kind === "tt")
      ?.text.trim() ?? ""
  )
}
