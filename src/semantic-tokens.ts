import * as vscode from "vscode"
import { cmdPositions } from "./cmd-position"
import { commentStart } from "./funcs"

const TOKEN_TYPES = ["function"] as const
const TOKEN_MODIFIERS = ["defaultLibrary"] as const

export const SEMANTIC_LEGEND = new vscode.SemanticTokensLegend(
  [...TOKEN_TYPES],
  [...TOKEN_MODIFIERS],
)

export class SemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider
{
  private builtins: Set<string>

  constructor(builtinNames: string[]) {
    this.builtins = new Set(builtinNames)
  }

  provideDocumentSemanticTokens(doc: vscode.TextDocument) {
    const b = new vscode.SemanticTokensBuilder(SEMANTIC_LEGEND)
    for (let i = 0; i < doc.lineCount; i++) {
      const text = doc.lineAt(i).text
      const cmtAt = commentStart(text)
      for (const pos of cmdPositions(text, cmtAt)) {
        const word = text.slice(pos.start, pos.end)
        if (this.builtins.has(word)) {
          b.push(i, pos.start, pos.end - pos.start, 0, 1 << 0)
        }
      }
    }
    return b.build()
  }
}
