import { positionAt, type TextSpan } from "@carlwr/zsh-core/analysis"
import { mkObserved } from "@carlwr/zsh-core/types"
import * as vscode from "vscode"
import { docAnalysis } from "../document/facts"
import {
  type TokenModifier,
  type TokenType,
  tokenModifiers,
  tokenTypes,
} from "../manifest/semantic-tokens"

const FILTERED_RESERVED_WORDS: ReadonlySet<string> = new Set([
  "{",
  "}",
  "[[",
  "]]",
  "((",
  "))",
])

const COMMAND_PRECMD = mkObserved("precmd_modifier", "command")

export const SEMANTIC_LEGEND = new vscode.SemanticTokensLegend(
  [...tokenTypes],
  [...tokenModifiers],
)

export class SemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider
{
  private builtins: ReadonlySet<string>
  // Painting policy for command-position tokens that are zsh-manual reserved
  // words but which the analyzer treats as ordinary command heads (e.g.
  // `declare`, `local`, `repeat`). The analyzer's keyword set is deliberately
  // narrower for command-position semantics; `corpus.reserved_word` is the
  // painting source so the editor renders the manual's full reserved list as
  // keywords. See DESIGN.md §"Reserved word: an enumeration-primary doc
  // category".
  private reservedWordPainting: ReadonlySet<string>

  constructor(
    builtinNames: Iterable<string>,
    reservedWordNames: Iterable<string>,
  ) {
    this.builtins = new Set(builtinNames)
    this.reservedWordPainting = new Set(reservedWordNames)
  }

  provideDocumentSemanticTokens(doc: vscode.TextDocument) {
    const b = new vscode.SemanticTokensBuilder(SEMANTIC_LEGEND)
    const { facts, starts } = docAnalysis(doc)
    const push = (
      span: TextSpan,
      type: TokenType,
      ...mods: TokenModifier[]
    ) => {
      const { line, char } = positionAt(starts, span.start)
      const bits = mods.reduce(
        (acc, m) => acc | (1 << tokenModifiers.indexOf(m)),
        0,
      )
      b.push(line, char, span.end - span.start, tokenTypes.indexOf(type), bits)
    }

    for (const fact of facts) {
      if (fact.kind === "reserved-word") {
        if (!FILTERED_RESERVED_WORDS.has(fact.text)) push(fact.span, "keyword")
        continue
      }
      if (fact.kind !== "cmd-head") continue
      if (fact.text === "[") continue
      if (fact.precmds.includes(COMMAND_PRECMD)) continue
      if (this.reservedWordPainting.has(fact.text)) push(fact.span, "keyword")
      else if (this.builtins.has(fact.text))
        push(fact.span, "function", "defaultLibrary")
    }
    return b.build()
  }
}
