import * as vscode from "vscode"
import { ZSH_DIAGNOSTIC_SOURCE, ZSH_LANG_ID } from "../ids"
import { settings } from "../manifest/settings"
import { onDidChangeSetting, readDiagnosticsEnabled } from "../settings"
import { zshCheck } from "../zsh"
import type { ZshError } from "../zsh/protocol"

const DEBOUNCE_MS = 500

// Not virtual documents (`git:` diff sides, …): they would only add Problems entries.
const lintable = (doc: vscode.TextDocument) =>
  doc.languageId === ZSH_LANG_ID &&
  ["file", "untitled"].includes(doc.uri.scheme)

export interface Diagnostics extends vscode.Disposable {
  /** Re-check every open zsh document, e.g. after the host zsh changed. */
  relintAll(): void
}

/** `zsh -n` syntax diagnostics: on open, save, change (debounced) and settings changes. */
export function setupDiagnostics(): Diagnostics {
  const dc = vscode.languages.createDiagnosticCollection(ZSH_DIAGNOSTIC_SOURCE)
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  async function lint(doc: vscode.TextDocument) {
    if (!lintable(doc)) return
    if (!readDiagnosticsEnabled()) return dc.set(doc.uri, [])
    const version = doc.version
    const r = await zshCheck(doc.getText())
    // A closed or since-edited document: the result is stale; an edit has
    // already queued its own check.
    if (doc.isClosed || doc.version !== version) return
    dc.set(doc.uri, r.kind === "error" ? [toDiagnostic(doc, r)] : [])
  }

  function lintDebounced(doc: vscode.TextDocument) {
    if (!lintable(doc)) return
    const key = doc.uri.toString()
    clearTimeout(timers.get(key))
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        lint(doc)
      }, DEBOUNCE_MS),
    )
  }

  function forget(doc: vscode.TextDocument) {
    const key = doc.uri.toString()
    clearTimeout(timers.get(key))
    timers.delete(key)
    dc.delete(doc.uri)
  }

  function relintAll() {
    for (const doc of vscode.workspace.textDocuments) lint(doc)
  }

  relintAll()
  const disposable = vscode.Disposable.from(
    dc,
    vscode.workspace.onDidOpenTextDocument(lint),
    vscode.workspace.onDidSaveTextDocument(lint),
    vscode.workspace.onDidChangeTextDocument(e => lintDebounced(e.document)),
    vscode.workspace.onDidCloseTextDocument(forget),
    onDidChangeSetting(settings.diagnosticsEnabled, relintAll),
  )
  return { dispose: () => disposable.dispose(), relintAll }
}

function toDiagnostic(
  doc: vscode.TextDocument,
  err: ZshError,
): vscode.Diagnostic {
  const line = Math.min(Math.max(0, err.line - 1), doc.lineCount - 1)
  const diag = new vscode.Diagnostic(
    doc.lineAt(line).range,
    err.msg,
    vscode.DiagnosticSeverity.Error,
  )
  diag.source = ZSH_DIAGNOSTIC_SOURCE
  return diag
}
