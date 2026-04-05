import * as vscode from "vscode";
import { CompletionProvider } from "./completions";
import { DefinitionProvider } from "./definition";
import { setupDiagnostics } from "./diagnostics";
import { DocLinkProvider } from "./doc-link";
import { HighlightProvider } from "./highlight";
import { HoverProvider } from "./hover";
import { initLog } from "./log";
import { ReferenceProvider } from "./references";
import { RenameProvider } from "./rename";
import { SEMANTIC_LEGEND, SemanticTokensProvider } from "./semantic-tokens";
import { SymbolProvider } from "./symbols";
import { WorkspaceSymbolProvider } from "./workspace-symbols";
import {
	setZshPath,
	zshAvailable,
	zshBuiltins,
	zshOptions,
	zshParameters,
	zshReswords,
} from "./zsh";
import { getCondOps, getOptions, initZshData } from "./zsh-data";

function readZshPathSetting(): string {
	return vscode.workspace.getConfiguration("betterZsh").get("zshPath", "");
}

export async function activate(ctx: vscode.ExtensionContext) {
	ctx.subscriptions.push(initLog());

	// Initialize zsh data (vendored .yo files)
	initZshData(ctx.extensionPath);

	// Read zsh path setting
	setZshPath(readZshPathSetting());
	ctx.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("betterZsh.zshPath")) {
				setZshPath(readZshPathSetting());
			}
		}),
	);

	// Parsed data from vendored .yo files (always available, no zsh needed)
	const parsedOptions = getOptions();
	const parsedCondOps = getCondOps();

	ctx.subscriptions.push(
		vscode.languages.registerDocumentHighlightProvider(
			"zsh",
			new HighlightProvider(),
		),
		vscode.languages.registerRenameProvider("zsh", new RenameProvider()),
		vscode.languages.registerDocumentSymbolProvider(
			"zsh",
			new SymbolProvider(),
		),
		vscode.languages.registerDefinitionProvider(
			"zsh",
			new DefinitionProvider(),
		),
		vscode.languages.registerReferenceProvider("zsh", new ReferenceProvider()),
		vscode.languages.registerWorkspaceSymbolProvider(
			new WorkspaceSymbolProvider(),
		),
		vscode.languages.registerDocumentLinkProvider("zsh", new DocLinkProvider()),
	);

	if (await zshAvailable()) {
		setupDiagnostics(ctx);
		const [bl, rw, opts, params] = await Promise.all([
			zshBuiltins(),
			zshReswords(),
			zshOptions(),
			zshParameters(),
		]);
		ctx.subscriptions.push(
			vscode.languages.registerHoverProvider(
				"zsh",
				new HoverProvider(params, parsedOptions, parsedCondOps),
			),
			vscode.languages.registerCompletionItemProvider(
				"zsh",
				new CompletionProvider({
					builtins: bl,
					reswords: rw,
					options: opts,
					params,
					zshOptions: parsedOptions,
					condOps: parsedCondOps,
				}),
			),
			vscode.languages.registerDocumentSemanticTokensProvider(
				"zsh",
				new SemanticTokensProvider(bl),
				SEMANTIC_LEGEND,
			),
		);
	} else {
		ctx.subscriptions.push(
			vscode.languages.registerHoverProvider(
				"zsh",
				new HoverProvider(undefined, parsedOptions, parsedCondOps),
			),
		);
	}
}
