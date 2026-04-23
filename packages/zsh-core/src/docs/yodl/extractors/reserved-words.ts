import { mkDocumented } from "../../brands.ts"
import type { ReservedWordDoc } from "../../types.ts"
import { extractSectionBody } from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { extractTokens } from "../core/text.ts"

// Heads handled by `complex_command`; their `ReservedWordDoc.desc` is left
// absent. See `ReservedWordDoc`'s comment for rationale.
const COMPLEX_HEADS: ReadonlySet<string> = new Set([
  "for",
  "while",
  "until",
  "repeat",
  "case",
  "select",
  "if",
  "function",
  "time",
  "[[",
  "{",
])

// Per-word prose — terse, honest, and avoids reiterating what lives more
// fully in `complex_command`. Missing keys fall back to `undefined` (desc
// omitted).
const ROLE: Readonly<Record<string, string>> = {
  // body keywords of complex commands
  do: "Body keyword delimiting the action block of `for`, `while`, `until`, `repeat`, `select`.",
  done: "Body keyword closing the action block of `for`, `while`, `until`, `repeat`, `select`.",
  then: "Body keyword introducing the true branch of `if` / `elif`.",
  elif: "Body keyword introducing a chained condition in `if`.",
  else: "Body keyword introducing the false branch of `if`.",
  fi: "Body keyword closing an `if` construct.",
  esac: "Body keyword closing a `case` construct.",
  in: "Body keyword marking the value list of `for`, `case`, or `select`.",
  // alternate-form keywords
  foreach:
    "Alternate-form head for `for`; used with the `foreach name (word ...) list end` syntax.",
  end: "Alternate-form closing keyword for the `foreach` construct.",
  // pipeline / negation / block bounds
  "!": "Pipeline negation modifier — inverts the exit status of the following pipeline.",
  coproc:
    "Runs the following command as a coprocess connected via bidirectional pipes.",
  // typeset family (scope / type declaration builtins reserved at parse time)
  declare: "Reserved-word alias for the `typeset` builtin.",
  typeset:
    "Declares scope / attributes for variables; reserved so it parses like an assignment.",
  export: "Reserved-word alias for `typeset -gx` (mark variables for export).",
  readonly: "Reserved-word alias for `typeset -r` (mark variables read-only).",
  local: "Reserved-word alias for `typeset` within a function's local scope.",
  integer: "Reserved-word alias for `typeset -i` (integer variables).",
  float: "Reserved-word alias for `typeset -F` / `-E` (floating-point variables).",
  // misc / completion bypass
  nocorrect:
    "Precommand-modifier-shaped reserved word that disables spelling correction for the command.",
}

const ANY_DESC =
  "Recognized in any position if neither `IGNORE_BRACES` nor `IGNORE_CLOSE_BRACES` is set."

function descFor(name: string): string | undefined {
  if (COMPLEX_HEADS.has(name)) return undefined
  return ROLE[name]
}

export function parseReswords(
  yo: string | YNodeSeq,
): readonly ReservedWordDoc[] {
  const words = extractTokens(extractSectionBody(yo, "Reserved Words"))
    .filter(tok => tok.kind === "tt")
    .map(tok => tok.text)
    .find(text => /\bdo\b/.test(text) && /\btypeset\b/.test(text))
  if (!words) return []

  const cmdEntries: ReservedWordDoc[] = words
    .split(/\s+/)
    .filter(name => name && name !== "}")
    .map(name => {
      const desc = descFor(name)
      return {
        name: mkDocumented("reserved_word", name),
        pos: "command",
        sig: name,
        section: "Reserved Words",
        ...(desc === undefined ? {} : { desc }),
      }
    })

  return [
    ...cmdEntries,
    {
      name: mkDocumented("reserved_word", "}"),
      pos: "any",
      sig: "}",
      desc: ANY_DESC,
      section: "Reserved Words",
    },
  ]
}
