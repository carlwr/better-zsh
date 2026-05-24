import { mkDocumented } from "../../brands.ts"
import type { SpecialFunctionDoc, SpecialFunctionKind } from "../../types.ts"
import {
  extractFirstItemList,
  extractSectionBody,
  withBody,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import {
  extractTokens,
  firstTt,
  normalizeBody,
  normalizeHeader,
} from "../core/text.ts"

const HOOK_SECTION = "Hook Functions"
const TRAP_SECTION = "Trap Functions"

/**
 * Two subsections contribute:
 * - `Hook Functions`: each has a companion `${name}_functions` array,
 *   populated into `hookArray`.
 * - `Trap Functions`: the template header is `tt(TRAP)var(NAL)`; its corpus
 *   id is the literal string `TRAPNAL`.
 */
export function parseSpecialFunctions(
  yo: YodlSrc,
): readonly SpecialFunctionDoc[] {
  return [...parseHooks(yo), ...parseTraps(yo)]
}

function parseHooks(yo: YodlSrc): SpecialFunctionDoc[] {
  return withBody(
    extractFirstItemList(extractSectionBody(yo, HOOK_SECTION)),
  ).flatMap(item => {
    const name = firstTt(item.header)?.trim()
    if (!name) return []
    return [
      {
        name: mkDocumented("special_function", name),
        sig: normalizeHeader(item.header),
        desc: normalizeBody(item.body),
        section: HOOK_SECTION,
        kind: "hook",
        hookArray: `${name}_functions`,
      } satisfies SpecialFunctionDoc,
    ]
  })
}

function parseTraps(yo: YodlSrc): SpecialFunctionDoc[] {
  return withBody(
    extractFirstItemList(extractSectionBody(yo, TRAP_SECTION)),
  ).flatMap(item => {
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
      } satisfies SpecialFunctionDoc,
    ]
  })
}

// Trap header shapes:
//   tt(TRAP)var(NAL)   -> name=TRAPNAL, kind=trap-template
//   tt(TRAPDEBUG)      -> name=TRAPDEBUG, kind=trap-literal
//   tt(TRAPZERR)       -> name=TRAPZERR, kind=trap-literal (TRAPERR alias via xitem)
function trapIdentity(
  header: YodlSrc,
  sig: string,
): { name: string; kind: SpecialFunctionKind } {
  const toks = extractTokens(header)
  const tt = toks.find(t => t.kind === "tt")?.text.trim() ?? ""
  if (toks.some(t => t.kind === "var")) {
    return { name: `${tt}NAL`, kind: "trap-template" }
  }
  // Direct sig starts at TRAP for all non-template trap entries; strip any
  // non-word cruft.
  const literal = sig.trim().match(/^TRAP[A-Z0-9]+/)?.[0] ?? tt
  return { name: literal, kind: "trap-literal" }
}
