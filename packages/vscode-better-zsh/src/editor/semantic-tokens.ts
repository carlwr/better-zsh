import { positionAt } from "@carlwr/zsh-core/analysis"
import { mkObserved } from "@carlwr/zsh-core/types"
import * as vscode from "vscode"
import { docAnalysis } from "./facts"

const TOKEN_TYPES = ["function", "keyword"] as const
const TOKEN_MODIFIERS = ["defaultLibrary"] as const
const FILTERED_RESERVED_WORDS: ReadonlySet<string> = new Set([
  "{",
  "}",
  "[[",
  "]]",
  "((",
  "))",
])

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
  // `declare`, `local`, `repeat`). The analyzer's keyword set is deliberately
  // narrower for command-position semantics; `corpus.reserved_word` is the
  // painting source so the editor renders the manual's full reserved list as
  // keywords. See DESIGN.md §"Reserved word: an enumeration-primary doc
  // category".
  private reservedWordPainting: Set<string>

  constructor(builtinNames: string[], reservedWordNames: readonly string[]) {
    this.builtins = new Set(builtinNames)
    this.reservedWordPainting = new Set(reservedWordNames)
  }

  provideDocumentSemanticTokens(doc: vscode.TextDocument) {
    const b = new vscode.SemanticTokensBuilder(SEMANTIC_LEGEND)
    const { facts, starts } = docAnalysis(doc)

    for (const fact of facts) {
      if (fact.kind === "reserved-word") {
        if (FILTERED_RESERVED_WORDS.has(fact.text)) continue
        pushSpan(b, starts, fact.span.start, fact.span.end, 1, 0)
        continue
      }
      if (fact.kind !== "cmd-head") continue
      if (fact.text === "[") continue
      if (fact.precmds.includes(mkObserved("precmd_modifier", "command")))
        continue
      if (this.reservedWordPainting.has(fact.text)) {
        pushSpan(b, starts, fact.span.start, fact.span.end, 1, 0)
        continue
      }
      if (this.builtins.has(fact.text)) {
        pushSpan(b, starts, fact.span.start, fact.span.end, 0, 1 << 0)
      }
    }
    return b.build()
  }
}

function pushSpan(
  b: vscode.SemanticTokensBuilder,
  starts: readonly number[],
  start: number,
  end: number,
  type: number,
  modifiers: number,
) {
  const { line, char } = positionAt(starts, start)
  b.push(line, char, end - start, type, modifiers)
}
