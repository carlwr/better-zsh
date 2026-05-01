import { cmdHeadFactsOnLine, commentStart } from "@carlwr/zsh-core/analysis"
import { mkObserved } from "@carlwr/zsh-core/types"
import * as vscode from "vscode"

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
  // Painting policy for command-position tokens that are zsh-manual reserved
  // words but which the analyzer treats as ordinary command heads (e.g.
  // `declare`, `typeset`, `local`, `export`, `integer`, `float`, `readonly`,
  // `foreach`, `repeat`, `end`, `nocorrect`). The analyzer's keyword set
  // (`KEYWORD_HEADS` in `analysis/line-facts.ts`) is deliberately narrower
  // for command-position semantics; the extension uses `corpus.reserved_word`
  // as the painting source so the editor renders the manual's full reserved
  // list as keywords. See DESIGN.md §"Reserved word: an enumeration-primary
  // doc category".
  private reservedWordPainting: Set<string>

  constructor(builtinNames: string[], reservedWordNames: readonly string[]) {
    this.builtins = new Set(builtinNames)
    this.reservedWordPainting = new Set(reservedWordNames)
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
        if (this.reservedWordPainting.has(fact.text)) {
          b.push(i, fact.span.start, fact.span.end - fact.span.start, 1, 0)
          continue
        }
        if (this.builtins.has(fact.text)) {
          b.push(i, fact.span.start, fact.span.end - fact.span.start, 0, 1 << 0)
        }
      }
    }
    return b.build()
  }
}
