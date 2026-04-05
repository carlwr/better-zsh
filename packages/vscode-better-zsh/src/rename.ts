import * as vscode from "vscode"
import { WORD_EXACT } from "zsh-core"
import { activeWordRangeAt, hasFunc, wordMatches } from "./funcs"

export class RenameProvider implements vscode.RenameProvider {
  prepareRename(doc: vscode.TextDocument, pos: vscode.Position) {
    const range = activeWordRangeAt(doc, pos)
    if (!range) return
    const name = doc.getText(range)
    // Keep rename narrow and predictable: only names that this extension can
    // identify as local function definitions get language-aware rename.
    if (!hasFunc(doc, name)) return
    return { range, placeholder: name }
  }

  provideRenameEdits(
    doc: vscode.TextDocument,
    pos: vscode.Position,
    newName: string,
  ) {
    const range = activeWordRangeAt(doc, pos)
    if (!range) return
    const name = doc.getText(range)
    if (!hasFunc(doc, name)) return
    if (!WORD_EXACT.test(newName)) {
      throw new Error("zsh function rename expects [A-Za-z0-9_][A-Za-z0-9_-]*")
    }
    const edit = new vscode.WorkspaceEdit()
    for (const range of wordMatches(doc, name)) {
      edit.replace(doc.uri, range, newName)
    }
    return edit
  }
}
