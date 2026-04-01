import * as vscode from "vscode";
import { activeWordRangeAt, funcDocs } from "./funcs";

function formatParamType(raw: string): string {
	const parts = raw.split("-");
	const base = parts[0] ?? raw;
	const flags: string[] = [];
	if (parts.includes("readonly")) flags.push("readonly");
	if (parts.includes("tied")) flags.push("tied");
	if (parts.includes("export")) flags.push("exported");
	return flags.length ? `${base} (${flags.join(", ")})` : base;
}

export class HoverProvider implements vscode.HoverProvider {
	private params: Map<string, string> | undefined;

	constructor(params?: Map<string, string>) {
		this.params = params;
	}

	provideHover(doc: vscode.TextDocument, pos: vscode.Position) {
		const range = activeWordRangeAt(doc, pos);
		if (!range) return;
		const w = doc.getText(range);
		const d = funcDocs(doc).get(w);
		if (d)
			return new vscode.Hover(
				new vscode.MarkdownString().appendCodeblock(d, ""),
			);
		if (this.params) {
			const ptype = this.params.get(w);
			if (ptype) {
				return new vscode.Hover(
					new vscode.MarkdownString(
						`\`${w}\`: ${formatParamType(ptype)} — zsh special parameter`,
					),
				);
			}
		}
	}
}
