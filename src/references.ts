import * as vscode from "vscode";
import { activeWordRangeAt, wordMatches } from "./funcs";

// Single-document only for now. Cross-file references are paused — unclear how
// to reliably identify "same function" across files without a project model.
export class ReferenceProvider implements vscode.ReferenceProvider {
	provideReferences(doc: vscode.TextDocument, pos: vscode.Position) {
		const range = activeWordRangeAt(doc, pos);
		if (!range) return;
		return wordMatches(doc, doc.getText(range)).map(
			(r) => new vscode.Location(doc.uri, r),
		);
	}
}
