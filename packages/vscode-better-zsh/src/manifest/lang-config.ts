// `LanguageConfigJson`: VS Code's language-configuration.json file format,
// after microsoft/vscode languageConfigurationExtensionPoint.ts @ 1.96.0.
interface LanguageConfigJson {
  comments?: { lineComment?: string; blockComment?: [string, string] }
  brackets?: [string, string][]
  colorizedBracketPairs?: [string, string][]
  autoClosingPairs?: (
    | [string, string]
    | { open: string; close: string; notIn?: string[] }
  )[]
  surroundingPairs?: ([string, string] | { open: string; close: string })[]
  wordPattern?: string | { pattern: string; flags?: string }
  indentationRules?: {
    increaseIndentPattern: string
    decreaseIndentPattern: string
    indentNextLinePattern?: string
    unIndentedLinePattern?: string
  }
  folding?: {
    markers?: { start: string; end: string }
    offSide?: boolean
  }
  onEnterRules?: {
    beforeText: string | { pattern: string; flags?: string }
    afterText?: string | { pattern: string; flags?: string }
    previousLineText?: string | { pattern: string; flags?: string }
    action: {
      indent: "none" | "indent" | "outdent" | "indentOutdent"
      appendText?: string
      removeText?: number
    }
  }[]
  autoCloseBefore?: string
}

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
