// Everything the extension registers at activation, in one place. The other
// half — the manifest's contribution points (language, grammar, snippets,
// settings, …) — is `manifest.ts`.

import type { DocCorpus } from "@carlwr/zsh-core"
import * as vscode from "vscode"
import { evictDocCaches } from "./cache"
import { CompletionProvider } from "./editor/completions"
import { DefinitionProvider } from "./editor/definition"
import { setupDiagnostics } from "./editor/diagnostics"
import { DocLinkProvider } from "./editor/doc-link"
import { HighlightProvider } from "./editor/highlight"
import { HoverProvider } from "./editor/hover"
import { ReferenceProvider } from "./editor/references"
import { RenameProvider } from "./editor/rename"
import {
  SEMANTIC_LEGEND,
  SemanticTokensProvider,
} from "./editor/semantic-tokens"
import { SymbolProvider } from "./editor/symbols"
import { WorkspaceSymbolProvider } from "./editor/workspace-symbols"
import {
  BETTER_ZSH_TEST_GET_LOGS,
  BETTER_ZSH_TEST_GET_SEMANTIC_TOKENS,
  ZSH_LANG_ID,
} from "./ids"
import { recentLogs } from "./log"
import { readZshPathConfig, ZSH_PATH_KEY } from "./settings"
import { configureZsh } from "./zsh"

const { commands, languages, workspace } = vscode

export function contribute(ctx: vscode.ExtensionContext, corpus: DocCorpus) {
  const zsh = ZSH_LANG_ID
  const semanticTokens = new SemanticTokensProvider(
    corpus.builtin.keys(),
    corpus.reserved_word.keys(),
  )
  const diagnostics = setupDiagnostics()

  ctx.subscriptions.push(
    // ── Reference knowledge (bundled corpus) ──
    languages.registerHoverProvider(zsh, new HoverProvider(corpus)),
    languages.registerCompletionItemProvider(
      zsh,
      new CompletionProvider(corpus),
    ),
    languages.registerDocumentSemanticTokensProvider(
      zsh,
      semanticTokens,
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

    // ── Host zsh: `zsh -n` diagnostics; binary re-resolved on setting change ──
    diagnostics,
    workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration(ZSH_PATH_KEY)) return
      configureZsh(readZshPathConfig())
      diagnostics.relintAll()
    }),

    // ── Per-document caches ──
    workspace.onDidCloseTextDocument(evictDocCaches),

    // ── Test hooks (VS Code test runs only) ──
    ...(process.env.VSCODE_TEST_OPTIONS
      ? [
          commands.registerCommand(BETTER_ZSH_TEST_GET_LOGS, recentLogs),
          commands.registerCommand(
            BETTER_ZSH_TEST_GET_SEMANTIC_TOKENS,
            async (uri: vscode.Uri) => {
              const doc = await workspace.openTextDocument(uri)
              return [...semanticTokens.provideDocumentSemanticTokens(doc).data]
            },
          ),
        ]
      : []),
  )
}
