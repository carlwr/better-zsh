import * as vscode from "vscode";
import { syntacticContext } from "./context";
import { activeWordRangeAt, commentStart, funcDocs } from "./funcs";
import { mdCond, mdOpt, mdParam } from "./hover-md";
import { mkCondOp, mkOptName } from "./types/brand";
import type { CondOperator, OptFlagAlias, ZshOption } from "./types/zsh-data";

export class HoverProvider implements vscode.HoverProvider {
	private params: Map<string, string> | undefined;
	private optionMap: Map<string, ZshOption> | undefined;
	private flagMap:
		| Map<string, { opt: ZshOption; alias: OptFlagAlias }>
		| undefined;
	private condOpMap: Map<string, CondOperator> | undefined;

	constructor(
		params?: Map<string, string>,
		options?: ZshOption[],
		condOps?: CondOperator[],
	) {
		this.params = params;
		if (options) {
			this.optionMap = new Map(options.map((o) => [o.name as string, o]));
			this.flagMap = new Map(
				options.flatMap((opt) =>
					opt.flags.map(
						(alias) => [alias.char as string, { opt, alias }] as const,
					),
				),
			);
		}
		if (condOps) {
			this.condOpMap = new Map(condOps.map((o) => [o.op as string, o]));
		}
	}

	provideHover(doc: vscode.TextDocument, pos: vscode.Position) {
		const ctx = syntacticContext(doc, pos.line, pos.character);

		// setopt context: option hover
		if (ctx.kind === "setopt" && this.optionMap) {
			const range = activeTokenRangeAt(doc, pos);
			if (!range) return;
			const token = doc.getText(range);
			const opt = this.optionAt(token);
			if (opt)
				return new vscode.Hover(new vscode.MarkdownString(mdOpt(opt)), range);
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

	private optionAt(token: string): ZshOption | undefined {
		const direct = this.optionMap?.get(mkOptName(token));
		if (direct) return direct;

		const noPrefixed = this.optionMap?.get(
			mkOptName(token.replace(/^no_?/i, "")),
		);
		if (noPrefixed) return noPrefixed;

		const short = token.match(/^([+-])([A-Za-z0-9])$/);
		if (!short?.[1] || !short[2] || !this.flagMap) return;
		// The hovered doc is keyed by the underlying option; sign only affects whether it sets or unsets it.
		const hit = this.flagMap.get(short[2]);
		return hit?.opt;
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
