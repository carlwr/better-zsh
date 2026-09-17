import * as vscode from "vscode"
import { funcAt, funcDecls } from "../document/funcs"
import { WORD_EXACT, wordMatches, wordMatchesAt } from "../document/words"
import { ZSH_LANG_ID } from "../ids"

// Single-document only. Cross-file references are paused — unclear how to
// reliably identify "same function" across files without a project model.

export class DefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(doc: vscode.TextDocument, pos: vscode.Position) {
    const hit = funcAt(doc, pos)
    if (hit) return new vscode.Location(doc.uri, hit.decl.selectionRange)
  }
}

export class ReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(doc: vscode.TextDocument, pos: vscode.Position) {
    return wordMatchesAt(doc, pos)?.map(r => new vscode.Location(doc.uri, r))
  }
}

export class HighlightProvider implements vscode.DocumentHighlightProvider {
  provideDocumentHighlights(doc: vscode.TextDocument, pos: vscode.Position) {
    return wordMatchesAt(doc, pos)?.map(r => new vscode.DocumentHighlight(r))
  }
}

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

// Outline is intentionally functions-only for now; function detection is the
// one document structure we already match robustly enough to expose.
export class SymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(doc: vscode.TextDocument) {
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
