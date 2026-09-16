import type { LanguageConfigJson } from "../types/lang-config"

// Word-boundary separator characters (one per line for diff/merge readability).
// A "word" is anything NOT in this set (plus a numeric literal alternative).
const seps = [
  "`",
  "~",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "=",
  "+",
  "[",
  "{",
  "]",
  "}",
  "\\",
  "|",
  ";",
  ":",
  "'",
  '"',
  ",",
  ".",
  "<",
  ">",
  "/",
  "?",
] as const

const escaped = seps.map(c => `\\${c}`).join("")
// (-?\d*\.\d\w*)|([^\`\~...\s]+)
const wordPattern = String.raw`(-?\d*\.\d\w*)|([^${escaped}\s]+)`

export const langConfig: LanguageConfigJson = {
  comments: { lineComment: "#" },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  wordPattern,
  autoClosingPairs: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    { open: '"', close: '"', notIn: ["string"] },
    { open: "'", close: "'", notIn: ["string"] },
    { open: "`", close: "`", notIn: ["string"] },
  ],
  surroundingPairs: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
  ],
  folding: {
    markers: {
      start: String.raw`^\s*#\s*#?region\b.*`,
      end: String.raw`^\s*#\s*#?endregion\b.*`,
    },
  },
}
