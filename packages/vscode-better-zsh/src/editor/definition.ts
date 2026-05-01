import * as vscode from "vscode"
import { activeWordRangeAt, funcDecls, hasFunc } from "./funcs"

export class DefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(doc: vscode.TextDocument, pos: vscode.Position) {
    const range = activeWordRangeAt(doc, pos)
    if (!range) return
    const name = doc.getText(range)
    if (!hasFunc(doc, name)) return
    const decl = funcDecls(doc).find(f => f.name === name)
    if (!decl) return
    return new vscode.Location(doc.uri, decl.selectionRange)
  }
}
