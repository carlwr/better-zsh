import * as vscode from "vscode";
import { asyncDocCache } from "./cache";
import { matchOptions } from "./option-match";
import { isSetoptContext } from "./setopt-context";
import { filterTokens, WORD, WORD_EXACT, zshTokenize } from "./zsh";

const getIds = asyncDocCache(async (doc) =>
	filterTokens(await zshTokenize(doc.getText())),
);

export interface CompletionData {
	builtins: string[];
	reswords: string[];
	options: string[];
	params: Map<string, string>;
}

export class CompletionProvider implements vscode.CompletionItemProvider {
	private general: vscode.CompletionItem[];
	private options: string[];

	constructor(data: CompletionData) {
		this.general = [
			...data.builtins
				.filter((n) => WORD_EXACT.test(n))
				.map(
					(n) =>
						new vscode.CompletionItem(n, vscode.CompletionItemKind.Keyword),
				),
			...data.reswords
				.filter((n) => WORD_EXACT.test(n))
				.map(
					(n) =>
						new vscode.CompletionItem(n, vscode.CompletionItemKind.Keyword),
				),
			...[...data.params.keys()]
				.filter((n) => WORD_EXACT.test(n))
				.map(
					(n) =>
						new vscode.CompletionItem(n, vscode.CompletionItemKind.Variable),
				),
		];
		this.options = data.options;
	}

	async provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position) {
		if (isSetoptContext(doc, pos.line)) {
			return this.optionCompletions(doc, pos);
		}
		return this.generalCompletions(doc, pos);
	}

	private async generalCompletions(
		doc: vscode.TextDocument,
		pos: vscode.Position,
	) {
		const ids = await getIds(doc);
		const curRange = doc.getWordRangeAtPosition(pos, WORD);
		const cur = curRange ? doc.getText(curRange) : "";
		const items = ids
			.filter((id) => id !== cur)
			.map(
				(id) => new vscode.CompletionItem(id, vscode.CompletionItemKind.Text),
			);
		return [...items, ...this.general.filter((b) => b.label !== cur)];
	}

	private optionCompletions(doc: vscode.TextDocument, pos: vscode.Position) {
		const curRange = doc.getWordRangeAtPosition(pos, WORD);
		const typed = curRange ? doc.getText(curRange) : "";
		const matches = matchOptions(this.options, typed);
		const items = matches.map((m) => {
			const item = new vscode.CompletionItem(
				m.label,
				vscode.CompletionItemKind.Property,
			);
			item.filterText = typed || m.label;
			return item;
		});
		return new vscode.CompletionList(items, true);
	}
}
