import * as vscode from "vscode";
import { syntacticContext } from "./context";
import { activeWordRangeAt, commentStart, funcDocs } from "./funcs";
import { mdCond, mdOpt, mdParam } from "./hover-md";
import { mkCondOp, mkOptName } from "./types/brand";
import type { CondOperator, ZshOption } from "./types/zsh-data";

export class HoverProvider implements vscode.HoverProvider {
	private params: Map<string, string> | undefined;
	private optionMap: Map<string, ZshOption> | undefined;
	private condOpMap: Map<string, CondOperator> | undefined;

	constructor(
		params?: Map<string, string>,
		options?: ZshOption[],
		condOps?: CondOperator[],
	) {
		this.params = params;
		if (options) {
			this.optionMap = new Map(options.map((o) => [o.name as string, o]));
		}
		if (condOps) {
			this.condOpMap = new Map(condOps.map((o) => [o.op as string, o]));
		}
	}

	provideHover(doc: vscode.TextDocument, pos: vscode.Position) {
		const ctx = syntacticContext(doc, pos.line, pos.character);

		// setopt context: option hover
		if (ctx.kind === "setopt" && this.optionMap) {
			const range = activeWordRangeAt(doc, pos);
			if (!range) return;
			const w = doc.getText(range);
			const name = mkOptName(w);
			const opt = this.optionMap.get(name);
			// Also check no-prefixed form
			if (opt)
				return new vscode.Hover(new vscode.MarkdownString(mdOpt(opt)), range);
			const noName = mkOptName(w.replace(/^no_?/i, ""));
			const noOpt = this.optionMap.get(noName);
			if (noOpt)
				return new vscode.Hover(new vscode.MarkdownString(mdOpt(noOpt)), range);
		}

		// cond context: operator hover
		if (ctx.kind === "cond" && this.condOpMap) {
			const range = activeTokenRangeAt(doc, pos);
			if (range) {
				const op = mkCondOp(doc.getText(range));
				const cop = this.condOpMap.get(op);
				if (cop)
					return new vscode.Hover(
						new vscode.MarkdownString(mdCond(cop)),
						range,
					);
			}
		}

		const range = activeWordRangeAt(doc, pos);
		if (!range) return;
		const w = doc.getText(range);

		// Function docs
		const d = funcDocs(doc).get(w);
		if (d)
			return new vscode.Hover(
				new vscode.MarkdownString().appendCodeblock(d, ""),
			);

		// Parameter type hover
		if (this.params) {
			const ptype = this.params.get(w);
			if (ptype) {
				return new vscode.Hover(new vscode.MarkdownString(mdParam(w, ptype)));
			}
		}
	}
}

function activeTokenRangeAt(
	doc: vscode.TextDocument,
	pos: vscode.Position,
): vscode.Range | undefined {
	const text = doc.lineAt(pos.line).text;
	const cut = commentStart(text) ?? text.length;
	if (pos.character >= cut) return;
	if (/\s/.test(text[pos.character] ?? "")) return;
	let start = pos.character;
	while (start > 0 && !/\s/.test(text[start - 1] ?? "")) start--;
	let end = pos.character;
	while (end < cut && !/\s/.test(text[end] ?? "")) end++;
	return start === end
		? undefined
		: new vscode.Range(pos.line, start, pos.line, end);
}
