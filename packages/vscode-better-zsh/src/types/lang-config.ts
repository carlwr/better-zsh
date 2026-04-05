// Vendored type for VS Code's language-configuration.json file format.
//
// Source: microsoft/vscode languageConfigurationExtensionPoint.ts
// https://github.com/microsoft/vscode/blob/1.96.0/src/vs/workbench/contrib/codeEditor/common/languageConfigurationExtensionPoint.ts
// @types/vscode: 1.96.0

export interface LanguageConfigJson {
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
