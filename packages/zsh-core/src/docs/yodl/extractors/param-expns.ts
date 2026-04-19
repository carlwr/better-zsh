import type { NonEmpty } from "@carlwr/typescript-extra"
import { mkDocumented } from "../../brands.ts"
import type { ParamExpnDoc, ParamExpnSubKind } from "../../types.ts"
import {
  collectAliasedEntries,
  extractItems,
  extractSectionBody,
} from "../core/doc.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

// Sigs here are literal doc templates — e.g. `${name:-word}` — not live
// user-code tokens. The `name`, `word`, `pattern`, `repl`, `spec`,
// `arrayname`, `offset`, `length` identifiers match the operand names the
// upstream manual uses in those templates; an exact-string table means a
// silent change in the upstream docs (e.g. `pattern` → `patn`) is caught on
// the next corpus parse rather than producing a silently wrong classification.
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
 * Narrow pre-parse patches for known upstream typos in zshexpn's PARAMETER
 * EXPANSION section. Each entry is keyed to a verbatim source snippet and
 * inserts the one missing character; if upstream fixes the typo the
 * substitution becomes a no-op and can be removed.
 *
 * Current entries:
 * - `replace` doc body: source has `` `tt(#%) are not active `` — missing
 *   the closing `'` that the paired tick-apostrophe idiom needs (cf. the
 *   preceding `` `tt(#)' `` and `` `tt(%)' `` in the same sentence). Without
 *   the fix, `renderInlineMd` leaves a lone backtick in the rendered desc
 *   and the `#%` never becomes an inline-code span like its siblings.
 */
function fixupUpstreamTypos(yo: string): string {
  return yo.replace(
    "`tt(%)' and `tt(#%) are not active",
    "`tt(%)' and `tt(#%)' are not active",
  )
}

/**
 * Parse the `Parameter Expansion` section of zshexpn into one record per sig.
 *
 * Groups of related sigs (e.g. the three `replace` forms) share a single doc
 * chunk in the manual via `xitem`/`item`. Each record in the output carries
 * its own sig but lists every sibling in `groupSigs` (manual source order) so
 * renderers can show the family together.
 */
export function parseParamExpns(yo: string): readonly ParamExpnDoc[] {
  const section = extractSectionBody(
    fixupUpstreamTypos(yo),
    "Parameter Expansion",
  )
  const entries = extractItems(section, 1)
  const out: ParamExpnDoc[] = []
  for (const { head, aliases, entry } of collectAliasedEntries(
    entries,
    normalizeHeader,
  )) {
    const desc = normalizeBody(entry.body ?? [])
    // Source order is `aliases` first (the preceding xitems) then `head` (the
    // item carrying the body); TS can't prove the spread-tail tuple matches
    // `[T, ...T[]]`, but the runtime invariant is clear.
    const groupSigs = [...aliases, head] as unknown as NonEmpty<string>
    for (let i = 0; i < groupSigs.length; i++) {
      const sig = groupSigs[i] as string
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
        section: "Parameter Expansion",
      })
    }
  }
  return out
}
