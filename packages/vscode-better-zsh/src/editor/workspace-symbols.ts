import * as vscode from "vscode"
import { ZSH_LANG_ID } from "../ids"
import { funcDecls } from "./funcs"

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  provideWorkspaceSymbols(query: string) {
    const lq = query.toLowerCase()
    const out: vscode.SymbolInformation[] = []
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId !== ZSH_LANG_ID) continue
      for (const f of funcDecls(doc)) {
        if (f.name.toLowerCase().includes(lq)) {
          out.push(
            new vscode.SymbolInformation(
              f.name,
              vscode.SymbolKind.Function,
              "",
              new vscode.Location(doc.uri, f.selectionRange),
            ),
          )
        }
      }
    }
    return out
  }
}
