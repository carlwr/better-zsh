import { isNonEmpty, type NonEmpty, nonEmpty } from "@carlwr/typescript-extra"
import { mkDocumented } from "../../brands.ts"
import type { ParamExpnDoc, ParamExpnSubKind } from "../../types.ts"
import {
  collectAliasedEntries,
  extractItems,
  extractSectionBody,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

// Sigs here are literal doc templates — e.g. `${name:-word}` — not live
// user-code tokens. Placeholder names mirror the upstream manual; an
// exact-string table means upstream identifier drift (e.g. `pattern` →
// `patn`) is caught on next corpus parse rather than silently mis-classifying.
type SigClassification = {
  readonly subKind: ParamExpnSubKind
  readonly placeholders: readonly string[]
}

const SIG_CLASSIFICATION: Readonly<Record<string, SigClassification>> = {
  "${name}": { subKind: "plain", placeholders: ["name"] },
  "${+name}": { subKind: "set-test", placeholders: ["name"] },
  "${name-word}": { subKind: "default", placeholders: ["name", "word"] },
  "${name:-word}": { subKind: "default", placeholders: ["name", "word"] },
  "${name+word}": { subKind: "alt", placeholders: ["name", "word"] },
  "${name:+word}": { subKind: "alt", placeholders: ["name", "word"] },
  "${name=word}": { subKind: "assign", placeholders: ["name", "word"] },
  "${name:=word}": { subKind: "assign", placeholders: ["name", "word"] },
  "${name::=word}": { subKind: "assign", placeholders: ["name", "word"] },
  "${name?word}": { subKind: "err", placeholders: ["name", "word"] },
  "${name:?word}": { subKind: "err", placeholders: ["name", "word"] },
  "${name#pattern}": {
    subKind: "strip-pre",
    placeholders: ["name", "pattern"],
  },
  "${name##pattern}": {
    subKind: "strip-pre",
    placeholders: ["name", "pattern"],
  },
  "${name%pattern}": {
    subKind: "strip-suf",
    placeholders: ["name", "pattern"],
  },
  "${name%%pattern}": {
    subKind: "strip-suf",
    placeholders: ["name", "pattern"],
  },
  "${name:#pattern}": { subKind: "exclude", placeholders: ["name", "pattern"] },
  "${name:|arrayname}": {
    subKind: "array-remove",
    placeholders: ["name", "arrayname"],
  },
  "${name:*arrayname}": {
    subKind: "array-retain",
    placeholders: ["name", "arrayname"],
  },
  "${name:^arrayname}": {
    subKind: "array-zip",
    placeholders: ["name", "arrayname"],
  },
  "${name:^^arrayname}": {
    subKind: "array-zip",
    placeholders: ["name", "arrayname"],
  },
  "${name:offset}": { subKind: "substring", placeholders: ["name", "offset"] },
  "${name:offset:length}": {
    subKind: "substring",
    placeholders: ["name", "offset", "length"],
  },
  "${name/pattern/repl}": {
    subKind: "replace",
    placeholders: ["name", "pattern", "repl"],
  },
  "${name//pattern/repl}": {
    subKind: "replace",
    placeholders: ["name", "pattern", "repl"],
  },
  "${name:/pattern/repl}": {
    subKind: "replace",
    placeholders: ["name", "pattern", "repl"],
  },
  "${#spec}": { subKind: "length", placeholders: ["spec"] },
  "${^spec}": { subKind: "rc-expand", placeholders: ["spec"] },
  "${^^spec}": { subKind: "rc-expand", placeholders: ["spec"] },
  "${=spec}": { subKind: "word-split", placeholders: ["spec"] },
  "${==spec}": { subKind: "word-split", placeholders: ["spec"] },
  "${~spec}": { subKind: "glob-subst", placeholders: ["spec"] },
  "${~~spec}": { subKind: "glob-subst", placeholders: ["spec"] },
}

/**
 * Pre-parse patch for a known upstream typo in zshexpn's PARAMETER EXPANSION
 * section. Removing becomes a no-op once upstream fixes the typo.
 *
 * - `replace` doc body: `` `tt(#%) are not active `` missing the closing `'`
 *   that the paired tick-apostrophe idiom needs (cf. the preceding
 *   `` `tt(#)' `` and `` `tt(%)' `` in the same sentence). Without the fix,
 *   `renderInlineMd` leaves a lone backtick and `#%` never becomes an
 *   inline-code span like its siblings.
 *
 * Exported so `loadCorpus` patches the shared file once; also applied here
 * for direct string callers (tests, one-off tools).
 */
export function fixupExpnYo(yo: string): string {
  return yo.replace(
    "`tt(%)' and `tt(#%) are not active",
    "`tt(%)' and `tt(#%)' are not active",
  )
}

const SECTION = "Parameter Expansion"

/**
 * One record per sig. Groups of related sigs (e.g. the three `replace` forms)
 * share a single doc chunk via `xitem`/`item`; each record lists every sibling
 * in `groupSigs` (source order) so renderers can show the family together.
 */
export function parseParamExpns(yo: YodlSrc): readonly ParamExpnDoc[] {
  const section = extractSectionBody(
    typeof yo === "string" ? fixupExpnYo(yo) : yo,
    SECTION,
  )
  const out: ParamExpnDoc[] = []
  for (const { head, aliases, entry } of collectAliasedEntries(
    extractItems(section, 1),
    normalizeHeader,
  )) {
    const desc = normalizeBody(entry.body ?? [])
    // Source order: preceding xitems (`aliases`) first, then body-carrying head.
    const groupSigs: NonEmpty<string> = isNonEmpty(aliases)
      ? [...aliases, head]
      : nonEmpty(head)
    groupSigs.forEach((sig, i) => {
      const cls = SIG_CLASSIFICATION[sig]
      if (!cls) {
        throw new Error(
          `parseParamExpns: unknown sig ${JSON.stringify(sig)} — extend SIG_CLASSIFICATION or investigate upstream doc change`,
        )
      }
      out.push({
        sig: mkDocumented("param_expn", sig),
        groupSigs,
        orderInGroup: i,
        subKind: cls.subKind,
        placeholders: cls.placeholders,
        desc,
        section: SECTION,
      })
    })
  }
  return out
}
