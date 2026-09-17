import type { DocCorpus } from "@carlwr/zsh-core"
import * as vscode from "vscode"
import { evictDocCaches } from "./document/cache"
import { CompletionProvider } from "./editor/completions"
import { setupDiagnostics } from "./editor/diagnostics"
import { DocLinkProvider } from "./editor/doc-link"
import { HoverProvider } from "./editor/hover"
import {
  DefinitionProvider,
  HighlightProvider,
  ReferenceProvider,
  RenameProvider,
  SymbolProvider,
  WorkspaceSymbolProvider,
} from "./editor/navigation"
import {
  SEMANTIC_LEGEND,
  SemanticTokensProvider,
} from "./editor/semantic-tokens"
import {
  BETTER_ZSH_CTX_ZSH_VISIBLE,
  BETTER_ZSH_TEST_GET_LOGS,
  ZSH_LANG_ID,
} from "./ids"
import { recentLogs } from "./log"
import { settings } from "./manifest/settings"
import { onDidChangeSetting, readZshConfig } from "./settings"
import { configureZsh } from "./zsh"

const { commands, languages, window, workspace } = vscode

export function contribute(ctx: vscode.ExtensionContext, corpus: DocCorpus) {
  const zsh = ZSH_LANG_ID

  // ── Host zsh: configured before the first diagnostics pass reads it ──
  configureZsh(readZshConfig())
  const diagnostics = setupDiagnostics()
  const reconfigureZsh = () => {
    configureZsh(readZshConfig())
    diagnostics.relintAll()
  }

  const syncZshVisible = () =>
    commands.executeCommand(
      "setContext",
      BETTER_ZSH_CTX_ZSH_VISIBLE,
      window.visibleTextEditors.some(e => e.document.languageId === zsh),
    )
  syncZshVisible()

  ctx.subscriptions.push(
    // ── Reference knowledge (bundled corpus) ──
    languages.registerHoverProvider(zsh, new HoverProvider(corpus)),
    languages.registerCompletionItemProvider(
      zsh,
      new CompletionProvider(corpus),
    ),
    languages.registerDocumentSemanticTokensProvider(
      zsh,
      new SemanticTokensProvider(
        corpus.builtin.keys(),
        corpus.reserved_word.keys(),
      ),
      SEMANTIC_LEGEND,
    ),

    // ── User-defined functions ──
    languages.registerDefinitionProvider(zsh, new DefinitionProvider()),
    languages.registerReferenceProvider(zsh, new ReferenceProvider()),
    languages.registerRenameProvider(zsh, new RenameProvider()),
    languages.registerDocumentHighlightProvider(zsh, new HighlightProvider()),
    languages.registerDocumentSymbolProvider(zsh, new SymbolProvider()),
    languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider()),

    // ── `source` / `.` paths as links ──
    languages.registerDocumentLinkProvider(zsh, new DocLinkProvider()),

    // ── Host zsh: `zsh -n` diagnostics; re-resolved on setting change and on trust grant ──
    diagnostics,
    onDidChangeSetting(settings.zshPath, reconfigureZsh),
    workspace.onDidGrantWorkspaceTrust(reconfigureZsh),

    // ── Per-document caches ──
    workspace.onDidCloseTextDocument(evictDocCaches),

    // ── Chat instructions: enabled while a zsh editor is visible ──
    // A language-mode change reopens the document, hence the document events.
    window.onDidChangeVisibleTextEditors(syncZshVisible),
    workspace.onDidOpenTextDocument(syncZshVisible),
    workspace.onDidCloseTextDocument(syncZshVisible),

    // ── Test hook (VS Code test runs only) ──
    ...(process.env.VSCODE_TEST_OPTIONS
      ? [commands.registerCommand(BETTER_ZSH_TEST_GET_LOGS, recentLogs)]
      : []),
  )
}
