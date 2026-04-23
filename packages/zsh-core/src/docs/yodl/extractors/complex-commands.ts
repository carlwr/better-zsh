import { mkDocumented } from "../../brands.ts"
import type { AlternateForm, ComplexCommandDoc } from "../../types.ts"
import {
  collectAliasedEntries,
  extractFirstList,
  extractItemList,
  extractSectionBody,
  type YodlEntry,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { extractTokens, normalizeBody, normalizeHeader } from "../core/text.ts"

/**
 * Head-keyword set used to drive `alternateForms` attachment and record
 * naming. A dedicated `for-arith` key separates the C-style `for (( … ))`
 * loop from the word-list `for name in … do … done` — structurally distinct
 * enough that collapsing them costs clarity.
 */
const HEAD_KEYS = [
  "if",
  "for",
  "for-arith",
  "while",
  "until",
  "repeat",
  "case",
  "select",
  "function",
  "time",
  "(",
  "{",
  "{try}always",
  "[[",
] as const

type HeadKey = (typeof HEAD_KEYS)[number]

const BODY_KW_SET: ReadonlySet<string> = new Set([
  "do",
  "done",
  "in",
  "then",
  "elif",
  "else",
  "fi",
  "esac",
  "always",
  "end",
])

function classifyHead(sig: string): HeadKey | undefined {
  const s = sig.trim()

  // Bracket-form heads: `[[ exp ]]`, `( list )`, `{ list }` / try-always.
  if (s.startsWith("[[")) return "[["
  if (s.startsWith("(")) return "("
  if (s.startsWith("{")) {
    // `{ try-list } always { always-list }` — unique compound head key so the
    // two brace blocks don't collide with the plain `{ list }` record.
    return /}\s*always\s*{/.test(s) ? "{try}always" : "{"
  }

  const firstWord = s.split(/\s+/)[0] ?? ""
  switch (firstWord) {
    case "if":
    case "while":
    case "until":
    case "repeat":
    case "case":
    case "select":
    case "function":
    case "time":
      return firstWord
    case "for":
      // `for (( … )) do … done` is the arithmetic form — distinct record key.
      return s.startsWith("for ((") || s.startsWith("for LPAR()LPAR()")
        ? "for-arith"
        : "for"
    case "foreach":
      // `foreach …` is an alternate form of `for`.
      return "for"
    default:
      return undefined
  }
}

function bodyKeywords(header: YNodeSeq): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tok of extractTokens(header)) {
    if (tok.kind !== "tt") continue
    for (const part of tok.text.split(/\s+/)) {
      const lower = part.toLowerCase()
      if (BODY_KW_SET.has(lower) && !seen.has(lower)) {
        seen.add(lower)
        out.push(lower)
      }
    }
  }
  return out
}

function altForm(item: YodlEntry): AlternateForm | undefined {
  const template = normalizeHeader(item.header)
  if (!template) return undefined
  return { template, keywords: bodyKeywords(item.header) }
}

/**
 * Parse the "Complex Commands" section into `ComplexCommandDoc` records, then
 * attach each "Alternate Forms for Complex Commands" item to the matching
 * base record via `classifyHead`.
 *
 * Items whose head does not classify (rare corpus edge cases) are dropped
 * silently; classification is intentionally a closed enumeration so drift in
 * the upstream grammar surfaces as missing records, not as silent mis-routing.
 */
export function parseComplexCommands(
  yo: string | YNodeSeq,
): readonly ComplexCommandDoc[] {
  const out = new Map<HeadKey, ComplexCommandDoc>()

  const base = extractFirstList(
    extractSectionBody(yo, "Complex Commands"),
    "item",
  )
  if (base) {
    // Capture every header — xitems that precede a body-bearing item share
    // that body (e.g. the `function` synopsis has two xitems before its
    // `item(...)(body)`). Return a non-undefined value unconditionally so
    // `collectAliasedEntries` doesn't reset the pending-head run on headers
    // whose first word isn't a known head keyword.
    const parseHead = (header: YodlEntry["header"]) => {
      const sig = normalizeHeader(header)
      return { head: classifyHead(sig), sig, header }
    }
    for (const grp of collectAliasedEntries(extractItemList(base), parseHead)) {
      if (!grp.entry.body) continue
      // Prefer the first classified head in the alias-run + body entry; the
      // winner supplies its own sig + header for bodyKeywords. Unclassified
      // groups (none of the headers start with a known keyword) are skipped.
      const all = [...grp.aliases, grp.head]
      const winner = all.find(x => x.head !== undefined)
      if (!winner?.head) continue
      if (out.has(winner.head)) continue
      out.set(winner.head, {
        name: mkDocumented("complex_command", winner.head),
        sig: winner.sig,
        desc: normalizeBody(grp.entry.body),
        section: "Complex Commands",
        alternateForms: [],
        bodyKeywords: bodyKeywords(winner.header),
      })
    }
  }

  const alt = extractFirstList(
    extractSectionBody(yo, "Alternate Forms For Complex Commands"),
    "item",
  )
  if (alt) {
    for (const item of extractItemList(alt)) {
      const sig = normalizeHeader(item.header)
      const head = classifyHead(sig)
      if (!head) continue
      const base = out.get(head)
      const af = altForm(item)
      if (!base || !af) continue
      out.set(head, {
        ...base,
        alternateForms: [...base.alternateForms, af],
      })
    }
  }

  return [...out.values()]
}
