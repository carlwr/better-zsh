import * as vscode from "vscode"
import { funcDecls } from "./funcs"

export class SymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(doc: vscode.TextDocument) {
    // Outline is intentionally functions-only for now; function detection is the
    // one document structure we already match robustly enough to expose.
    return funcDecls(doc).map(
      ({ name, range, selectionRange }) =>
        new vscode.DocumentSymbol(
          name,
          "",
          vscode.SymbolKind.Function,
          range,
          selectionRange,
        ),
    )
  }
}
