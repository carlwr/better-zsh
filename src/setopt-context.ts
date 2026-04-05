/**
 * Detect whether the cursor is in a setopt/unsetopt option-name position.
 * Handles line continuations (trailing backslash).
 */

interface DocLike {
	lineAt(i: number): { text: string };
	lineCount: number;
}

export function isSetoptContext(doc: DocLike, line: number): boolean {
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
	if (
		cmd === "set" &&
		(start !== line ||
			words
				.slice(1)
				.some((word) => word.startsWith("-") || word.startsWith("+")))
	)
		return true;
	return false;
}
