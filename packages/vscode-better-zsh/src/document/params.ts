import type * as vscode from "vscode"
import { docCache } from "./cache"
import { activeText } from "./words"

// Two characters or more: single-letter names are not worth completing.
const NAME = String.raw`[A-Za-z_]\w+`

// Sites where a word is a parameter name for certain — nowhere else is one
// distinguishable from an argument or a word in a string.
const SITES = [
  // `$name`, `${name`, `${(flags)name`, `${#name`, `${+name`, `${~name`, …
  new RegExp(String.raw`\$\{?(?:\([^)]*\))?[#+^=~!]?(${NAME})`, "g"),
  // `name=`, `name+=`, `name[i]=` — not `==`, not `--flag=`
  new RegExp(String.raw`(?<![\w$-])(${NAME})(?:\[[^\]]*\])?\+?=(?!=)`, "g"),
  // declarations, past any flags
  new RegExp(
    String.raw`\b(?:local|typeset|declare|export|readonly|integer|float|unset)\s+(?:[-+]\S+\s+)*(${NAME})`,
    "g",
  ),
  // loop and read targets
  new RegExp(
    String.raw`\b(?:for|foreach|read|select)\s+(?:-\S+\s+)*(${NAME})\b`,
    "g",
  ),
]

/** Parameter names referenced, assigned or declared in `doc`, outside comments; deduplicated, unordered. */
export const paramNames = docCache((doc: vscode.TextDocument) => {
  const out = new Set<string>()
  for (let i = 0; i < doc.lineCount; i++) {
    const line = activeText(doc.lineAt(i).text)
    for (const re of SITES)
      for (const m of line.matchAll(re)) if (m[1]) out.add(m[1])
  }
  return [...out]
})
