import { commentStart } from "./comment";

export type SyntacticContext =
	| { kind: "setopt" }
	| { kind: "cond" }
	| { kind: "arith" }
	| { kind: "general" };

export type ContextKind = SyntacticContext["kind"];

interface DocLike {
	lineAt(i: number): { text: string };
	lineCount: number;
}

/** Detect syntactic context at a given position. */
export function syntacticContext(
	doc: DocLike,
	line: number,
	char: number,
): SyntacticContext {
	if (isSetoptCtx(doc, line)) return { kind: "setopt" };
	if (isBracketCtx(doc, line, char, "[[", "]]")) return { kind: "cond" };
	if (isBracketCtx(doc, line, char, "((", "))")) return { kind: "arith" };
	return { kind: "general" };
}

function isSetoptCtx(doc: DocLike, line: number): boolean {
	let start = line;
	while (
		start > 0 &&
		doc
			.lineAt(start - 1)
			.text.trimEnd()
			.endsWith("\\")
	)
		start--;
	const first = doc.lineAt(start).text.trimStart();
	const words = first.split(/\s+/);
	const cmd = words[0];
	if (cmd === "setopt" || cmd === "unsetopt") return true;
	if (cmd === "set" && (words[1] === "-o" || words[1] === "+o")) return true;
	return false;
}

/**
 * Walk backwards from (line, char) to detect unmatched open bracket pair.
 * On the current line, scan only up to `char`. On previous lines, scan fully.
 */
function isBracketCtx(
	doc: DocLike,
	line: number,
	char: number,
	open: string,
	close: string,
): boolean {
	let depth = 0;
	for (let i = line; i >= 0; i--) {
		const text = doc.lineAt(i).text;
		const cut = commentStart(text) ?? text.length;
		const end = i === line ? Math.min(char, cut) : cut;
		const active = text.slice(0, end);
		depth += countPairs(active, open, close);
		if (depth > 0) return true;
	}
	return false;
}

/** Count net open (+1) vs close (-1) bracket pairs, respecting quotes. */
function countPairs(line: string, open: string, close: string): number {
	let depth = 0;
	let sq = false;
	let dq = false;
	let esc = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (esc) {
			esc = false;
			continue;
		}
		if (ch === "\\") {
			esc = true;
			continue;
		}
		if (sq) {
			if (ch === "'") sq = false;
			continue;
		}
		if (dq) {
			if (ch === '"') dq = false;
			continue;
		}
		if (ch === "'") {
			sq = true;
			continue;
		}
		if (ch === '"') {
			dq = true;
			continue;
		}
		if (ch === open[0] && i + 1 < line.length && line[i + 1] === open[1]) {
			depth++;
			i++;
		} else if (
			ch === close[0] &&
			i + 1 < line.length &&
			line[i + 1] === close[1]
		) {
			depth--;
			i++;
		}
	}
	return depth;
}
