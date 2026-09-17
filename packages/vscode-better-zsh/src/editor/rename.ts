import * as vscode from "vscode"
import { funcAt, wordMatches } from "./funcs"
import { WORD_EXACT } from "./words"

// Rename stays narrow and predictable: only names this extension identifies
// as local function definitions.
export class RenameProvider implements vscode.RenameProvider {
  prepareRename(doc: vscode.TextDocument, pos: vscode.Position) {
    const hit = funcAt(doc, pos)
    if (hit) return { range: hit.range, placeholder: hit.decl.name }
  }

  provideRenameEdits(
    doc: vscode.TextDocument,
    pos: vscode.Position,
    newName: string,
  ) {
    const hit = funcAt(doc, pos)
    if (!hit) return
    if (!WORD_EXACT.test(newName))
      throw new Error(`zsh function rename expects ${WORD_EXACT.source}`)
    const edit = new vscode.WorkspaceEdit()
    for (const range of wordMatches(doc, hit.decl.name))
      edit.replace(doc.uri, range, newName)
    return edit
  }
}
