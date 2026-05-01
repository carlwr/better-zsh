import { loadCorpus } from "@carlwr/zsh-core"
import { PKG_VERSION, ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
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
import { registerZshRefTools } from "./lm-adapter/zsh-ref-tools"
import { initLog, log, recentLogs } from "./log"
import { readZshPathConfig, ZSH_PATH_KEY } from "./settings"
import { configureZsh } from "./zsh"

export async function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(initLog())

  const extVersion = ctx.extension?.packageJSON?.version ?? "unknown"
  log(
    `better-zsh ${extVersion} | zsh-core ${PKG_VERSION} | ${ZSH_UPSTREAM.tag} (${ZSH_UPSTREAM.commit.slice(0, 7)})`,
  )

  configureZsh(readZshPathConfig())
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(ZSH_PATH_KEY))
        configureZsh(readZshPathConfig())
    }),
  )

  // Parsed data from vendored .yo files (always available, no zsh needed)
  // Keep semi-static language knowledge bundled and ready immediately; host
  // zsh is reserved for diagnostics/tokenization paths where execution matters.
  const corpus = loadCorpus()
  const builtinNames = [...corpus.builtin.values()].map(builtin => builtin.name)
  const reservedWordNames = [...corpus.reserved_word.keys()]
  const semanticTokensProvider = new SemanticTokensProvider(
    builtinNames,
    reservedWordNames,
  )

  setupDiagnostics(ctx)
  registerZshRefTools(ctx, corpus)

  ctx.subscriptions.push(
    vscode.languages.registerDocumentHighlightProvider(
      ZSH_LANG_ID,
      new HighlightProvider(),
    ),
    vscode.workspace.onDidCloseTextDocument(evictDocCaches),
    vscode.languages.registerRenameProvider(ZSH_LANG_ID, new RenameProvider()),
    vscode.languages.registerDocumentSymbolProvider(
      ZSH_LANG_ID,
      new SymbolProvider(),
    ),
    vscode.languages.registerDefinitionProvider(
      ZSH_LANG_ID,
      new DefinitionProvider(),
    ),
    vscode.languages.registerReferenceProvider(
      ZSH_LANG_ID,
      new ReferenceProvider(),
    ),
    vscode.languages.registerWorkspaceSymbolProvider(
      new WorkspaceSymbolProvider(),
    ),
    vscode.languages.registerDocumentLinkProvider(
      ZSH_LANG_ID,
      new DocLinkProvider(),
    ),
    vscode.languages.registerHoverProvider(
      ZSH_LANG_ID,
      new HoverProvider(corpus),
    ),
    vscode.languages.registerCompletionItemProvider(
      ZSH_LANG_ID,
      new CompletionProvider(corpus),
    ),
    vscode.languages.registerDocumentSemanticTokensProvider(
      ZSH_LANG_ID,
      semanticTokensProvider,
      SEMANTIC_LEGEND,
    ),
  )

  if (process.env.VSCODE_TEST_OPTIONS) {
    ctx.subscriptions.push(
      vscode.commands.registerCommand(BETTER_ZSH_TEST_GET_LOGS, () =>
        recentLogs(),
      ),
      vscode.commands.registerCommand(
        BETTER_ZSH_TEST_GET_SEMANTIC_TOKENS,
        async (uri: vscode.Uri) => {
          const doc = await vscode.workspace.openTextDocument(uri)
          const tokens = await Promise.resolve(
            semanticTokensProvider.provideDocumentSemanticTokens(doc),
          )
          return [...(tokens?.data ?? [])]
        },
      ),
    )
  }
}
