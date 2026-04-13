import * as vscode from "vscode"
import {
  getBuiltins,
  getCondOps,
  getOptions,
  getPrecmds,
  getProcessSubsts,
  getRedirections,
  getReservedWords,
  getShellParams,
} from "zsh-core"
import { evictDocCaches } from "./cache"
import { CompletionProvider } from "./completions"
import { DefinitionProvider } from "./definition"
import { setupDiagnostics } from "./diagnostics"
import { DocLinkProvider } from "./doc-link"
import { HighlightProvider } from "./highlight"
import { HoverProvider } from "./hover"
import {
  BETTER_ZSH_TEST_GET_LOGS,
  BETTER_ZSH_TEST_GET_SEMANTIC_TOKENS,
  ZSH_LANG_ID,
} from "./ids"
import { initLog, recentLogs } from "./log"
import { ReferenceProvider } from "./references"
import { RenameProvider } from "./rename"
import { SEMANTIC_LEGEND, SemanticTokensProvider } from "./semantic-tokens"
import { readZshPathConfig, ZSH_PATH_KEY } from "./settings"
import { SymbolProvider } from "./symbols"
import { WorkspaceSymbolProvider } from "./workspace-symbols"
import { configureZsh } from "./zsh"

export async function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(initLog())

  configureZsh(readZshPathConfig())
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ZSH_PATH_KEY))
        configureZsh(readZshPathConfig())
    }),
  )

  // Parsed data from vendored .yo files (always available, no zsh needed)
  // Keep semi-static language knowledge bundled and ready immediately; host
  // zsh is reserved for diagnostics/tokenization paths where execution matters.
  const parsedBuiltins = getBuiltins()
  const parsedOptions = getOptions()
  const parsedCondOps = getCondOps()
  const parsedPrecmds = getPrecmds()
  const parsedRedirs = getRedirections()
  const parsedProcessSubsts = getProcessSubsts()
  const parsedReservedWords = getReservedWords()
  const parsedShellParams = getShellParams()
  const builtinNames = parsedBuiltins.map((builtin) => builtin.name)
  const semanticTokensProvider = new SemanticTokensProvider(builtinNames)

  setupDiagnostics(ctx)

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
      new HoverProvider(
        parsedShellParams,
        parsedOptions,
        parsedCondOps,
        parsedBuiltins,
        parsedPrecmds,
        parsedRedirs,
        parsedProcessSubsts,
        parsedReservedWords,
      ),
    ),
    vscode.languages.registerCompletionItemProvider(
      ZSH_LANG_ID,
      new CompletionProvider({
        builtins: parsedBuiltins,
        reservedWords: parsedReservedWords,
        precmds: parsedPrecmds,
        options: parsedOptions,
        params: parsedShellParams,
        condOps: parsedCondOps,
      }),
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
