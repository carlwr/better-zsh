import * as vscode from "vscode";
import { CompletionProvider } from "./completions";
import { DefinitionProvider } from "./definition";
import { setupDiagnostics } from "./diagnostics";
import { HighlightProvider } from "./highlight";
import { HoverProvider } from "./hover";
import { initLog } from "./log";
import { ReferenceProvider } from "./references";
import { RenameProvider } from "./rename";
import { SEMANTIC_LEGEND, SemanticTokensProvider } from "./semantic-tokens";
import { SymbolProvider } from "./symbols";
import { WorkspaceSymbolProvider } from "./workspace-symbols";
import {
	zshAvailable,
	zshBuiltins,
	zshOptions,
	zshParameters,
	zshReswords,
} from "./zsh";

export async function activate(ctx: vscode.ExtensionContext) {
	ctx.subscriptions.push(initLog());

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
			vscode.languages.registerHoverProvider("zsh", new HoverProvider(params)),
			vscode.languages.registerCompletionItemProvider(
				"zsh",
				new CompletionProvider({
					builtins: bl,
					reswords: rw,
					options: opts,
					params,
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
			vscode.languages.registerHoverProvider("zsh", new HoverProvider()),
		);
	}
}
