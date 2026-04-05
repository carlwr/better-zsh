import * as vscode from "vscode"
import { activeWordRangeAt, wordMatches } from "./funcs"

export class HighlightProvider implements vscode.DocumentHighlightProvider {
  provideDocumentHighlights(doc: vscode.TextDocument, pos: vscode.Position) {
    const range = activeWordRangeAt(doc, pos)
    if (!range) return []
    return wordMatches(doc, doc.getText(range)).map(
      (range) => new vscode.DocumentHighlight(range),
    )
  }
}
