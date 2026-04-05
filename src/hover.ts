import * as vscode from "vscode";
import { syntacticContext } from "./context";
import { activeWordRangeAt, funcDocs } from "./funcs";
import { mkCondOp, mkOptName } from "./types/brand";
import type { CondOperator, ZshOption } from "./types/zsh-data";

function formatParamType(raw: string): string {
	const parts = raw.split("-");
	const base = parts[0] ?? raw;
	const flags: string[] = [];
	if (parts.includes("readonly")) flags.push("readonly");
	if (parts.includes("tied")) flags.push("tied");
	if (parts.includes("export")) flags.push("exported");
	return flags.length ? `${base} (${flags.join(", ")})` : base;
}

function formatOptionHover(opt: ZshOption): vscode.MarkdownString {
	const letter = opt.letter ? ` (\`-${opt.letter}\`)` : "";
	const defaults =
		opt.defaults.length > 0 ? ` <${opt.defaults.join(", ")}>` : "";
	return new vscode.MarkdownString(
		`\`${opt.display}\`${letter}${defaults} — *${opt.category}*\n\n${opt.desc}`,
	);
}

function formatCondOpHover(cop: CondOperator): vscode.MarkdownString {
	const sig =
		cop.kind === "unary"
			? `\`${cop.op}\` *${cop.operands.join(" ")}*`
			: `*${cop.operands[0] ?? ""}* \`${cop.op}\` *${cop.operands[1] ?? ""}*`;
	return new vscode.MarkdownString(`${sig}\n\n${cop.desc}`);
}

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
		const range = activeWordRangeAt(doc, pos);
		if (!range) return;
		const w = doc.getText(range);

		const ctx = syntacticContext(doc, pos.line, pos.character);

		// setopt context: option hover
		if (ctx.kind === "setopt" && this.optionMap) {
			const name = mkOptName(w);
			const opt = this.optionMap.get(name);
			// Also check no-prefixed form
			if (opt) return new vscode.Hover(formatOptionHover(opt), range);
			const noName = mkOptName(w.replace(/^no_?/i, ""));
			const noOpt = this.optionMap.get(noName);
			if (noOpt) return new vscode.Hover(formatOptionHover(noOpt), range);
		}

		// cond context: operator hover
		if (ctx.kind === "cond" && this.condOpMap) {
			const op = mkCondOp(w);
			const cop = this.condOpMap.get(op);
			if (cop) return new vscode.Hover(formatCondOpHover(cop), range);
		}

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
				return new vscode.Hover(
					new vscode.MarkdownString(
						`\`${w}\`: ${formatParamType(ptype)} — zsh special parameter`,
					),
				);
			}
		}
	}
}
