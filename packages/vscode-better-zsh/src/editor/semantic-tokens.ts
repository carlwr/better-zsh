import { analyzeDoc } from "@carlwr/zsh-core/analysis"
import { mkObserved } from "@carlwr/zsh-core/types"
import * as vscode from "vscode"

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
    const starts = lineStarts(doc)

    for (const fact of analyzeDoc(doc)) {
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

function lineStarts(doc: vscode.TextDocument): readonly number[] {
  const out: number[] = []
  let off = 0
  for (let i = 0; i < doc.lineCount; i++) {
    out.push(off)
    off += doc.lineAt(i).text.length + 1
  }
  return out
}

function pushSpan(
  b: vscode.SemanticTokensBuilder,
  starts: readonly number[],
  start: number,
  end: number,
  type: number,
  modifiers: number,
) {
  const line = lineAt(starts, start)
  const lineStart = starts[line] ?? 0
  b.push(line, start - lineStart, end - start, type, modifiers)
}

function lineAt(starts: readonly number[], pos: number): number {
  let line = 0
  for (let i = 1; i < starts.length; i++) {
    const start = starts[i]
    if (start === undefined || start > pos) break
    line = i
  }
  return line
}
