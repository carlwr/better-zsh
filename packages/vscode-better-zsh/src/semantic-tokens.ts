import * as vscode from "vscode"
import { cmdHeadFactsOnLine, commentStart, mkObserved } from "zsh-core"

const TOKEN_TYPES = ["function", "keyword"] as const
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
      for (const fact of cmdHeadFactsOnLine(text, cmtAt)) {
        if (fact.kind === "reserved-word") {
          if (fact.text === "{" || fact.text === "}") continue
          b.push(i, fact.span.start, fact.span.end - fact.span.start, 1, 0)
          continue
        }
        if (fact.kind !== "cmd-head") continue
        if (fact.text === "[") continue
        if (fact.precmds.includes(mkObserved("precmd", "command"))) continue
        if (this.builtins.has(fact.text)) {
          b.push(i, fact.span.start, fact.span.end - fact.span.start, 0, 1 << 0)
        }
      }
    }
    return b.build()
  }
}
