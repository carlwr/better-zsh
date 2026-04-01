import * as vscode from "vscode";
import { zshCheck } from "./zsh";

const DIAGNOSE_ON_CHANGE = true;
const DEBOUNCE_MS = 500;

export function setupDiagnostics(ctx: vscode.ExtensionContext) {
	const dc = vscode.languages.createDiagnosticCollection("zsh");
	ctx.subscriptions.push(dc);

	async function lint(doc: vscode.TextDocument) {
		if (doc.languageId !== "zsh") return;
		const r = await zshCheck(doc.getText());
		if (r.ok) {
			dc.set(doc.uri, []);
			return;
		}
		const line = Math.min(Math.max(0, r.line - 1), doc.lineCount - 1);
		const diag = new vscode.Diagnostic(
			doc.lineAt(line).range,
			r.msg,
			vscode.DiagnosticSeverity.Error,
		);
		diag.source = "zsh";
		dc.set(doc.uri, [diag]);
	}

	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	function lintDebounced(doc: vscode.TextDocument) {
		const key = doc.uri.toString();
		const prev = timers.get(key);
		if (prev) clearTimeout(prev);
		timers.set(
			key,
			setTimeout(() => {
				timers.delete(key);
				lint(doc);
			}, DEBOUNCE_MS),
		);
	}

	ctx.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(lint),
		vscode.workspace.onDidSaveTextDocument(lint),
		vscode.workspace.onDidCloseTextDocument((doc) => {
			const key = doc.uri.toString();
			const t = timers.get(key);
			if (t) {
				clearTimeout(t);
				timers.delete(key);
			}
			dc.delete(doc.uri);
		}),
	);

	if (DIAGNOSE_ON_CHANGE) {
		ctx.subscriptions.push(
			vscode.workspace.onDidChangeTextDocument((e) =>
				lintDebounced(e.document),
			),
		);
	}

	for (const doc of vscode.workspace.textDocuments) lint(doc);
}
