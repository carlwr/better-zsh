import * as vscode from "vscode"
import { ZSH_LANG_ID } from "../ids"
import { funcDecls } from "./funcs"

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  provideWorkspaceSymbols(query: string) {
    const q = query.toLowerCase()
    return vscode.workspace.textDocuments
      .filter(doc => doc.languageId === ZSH_LANG_ID)
      .flatMap(doc =>
        funcDecls(doc)
          .filter(f => f.name.toLowerCase().includes(q))
          .map(
            f =>
              new vscode.SymbolInformation(
                f.name,
                vscode.SymbolKind.Function,
                "",
                new vscode.Location(doc.uri, f.selectionRange),
              ),
          ),
      )
  }
}
