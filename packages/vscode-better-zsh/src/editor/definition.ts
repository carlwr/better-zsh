import * as vscode from "vscode"
import { funcAt } from "./funcs"

export class DefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(doc: vscode.TextDocument, pos: vscode.Position) {
    const hit = funcAt(doc, pos)
    if (hit) return new vscode.Location(doc.uri, hit.decl.selectionRange)
  }
}
