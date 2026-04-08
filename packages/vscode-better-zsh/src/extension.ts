import * as vscode from "vscode"
import {
  getBuiltins,
  getCondOps,
  getOptions,
  getPrecmds,
  getProcessSubsts,
  getRedirections,
  getReservedWords,
} from "zsh-core"
import { CompletionProvider } from "./completions"
import { DefinitionProvider } from "./definition"
import { setupDiagnostics } from "./diagnostics"
import { DocLinkProvider } from "./doc-link"
import { HighlightProvider } from "./highlight"
import { HoverProvider } from "./hover"
import { BETTER_ZSH_CONFIG, BETTER_ZSH_ZSH_PATH, ZSH_LANG_ID } from "./ids"
import { initLog } from "./log"
import { ReferenceProvider } from "./references"
import { RenameProvider } from "./rename"
import { SEMANTIC_LEGEND, SemanticTokensProvider } from "./semantic-tokens"
import { SymbolProvider } from "./symbols"
import { WorkspaceSymbolProvider } from "./workspace-symbols"
import {
  setZshPath,
  zshAvailable,
  zshBuiltins,
  zshOptions,
  zshParameters,
  zshReswords,
} from "./zsh"

function readZshPathSetting(): string {
  return vscode.workspace.getConfiguration(BETTER_ZSH_CONFIG).get("zshPath", "")
}

export async function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(initLog())

  // Read zsh path setting
  setZshPath(readZshPathSetting())
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(BETTER_ZSH_ZSH_PATH)) {
        setZshPath(readZshPathSetting())
      }
    }),
  )

  // Parsed data from vendored .yo files (always available, no zsh needed)
  const parsedBuiltins = getBuiltins()
  const parsedOptions = getOptions()
  const parsedCondOps = getCondOps()
  const parsedPrecmds = getPrecmds()
  const parsedRedirs = getRedirections()
  const parsedProcessSubsts = getProcessSubsts()
  const parsedReservedWords = getReservedWords()

  ctx.subscriptions.push(
    vscode.languages.registerDocumentHighlightProvider(
      ZSH_LANG_ID,
      new HighlightProvider(),
    ),
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
  )

  if (await zshAvailable()) {
    setupDiagnostics(ctx)
    const [builtinNames, reservedWords, optionNames, params] =
      await Promise.all([
        zshBuiltins(),
        zshReswords(),
        zshOptions(),
        zshParameters(),
      ])
    ctx.subscriptions.push(
      vscode.languages.registerHoverProvider(
        ZSH_LANG_ID,
        new HoverProvider(
          params,
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
          builtins: builtinNames,
          reservedWords,
          options: optionNames,
          params,
          builtinDocs: parsedBuiltins,
          reservedWordDocs: parsedReservedWords,
          zshOptions: parsedOptions,
          condOps: parsedCondOps,
        }),
      ),
      vscode.languages.registerDocumentSemanticTokensProvider(
        ZSH_LANG_ID,
        new SemanticTokensProvider(builtinNames),
        SEMANTIC_LEGEND,
      ),
    )
  } else {
    ctx.subscriptions.push(
      vscode.languages.registerHoverProvider(
        ZSH_LANG_ID,
        new HoverProvider(
          undefined,
          parsedOptions,
          parsedCondOps,
          parsedBuiltins,
          parsedPrecmds,
          parsedRedirs,
          parsedProcessSubsts,
          parsedReservedWords,
        ),
      ),
    )
  }
}
