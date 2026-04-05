// Generic yodl macro parser for zsh documentation files.
// Handles the ~15 macros used across zsh docs. NOT a general yodl parser.

export interface YodlItem {
	header: string; // raw header (still has tt/var markup)
	body?: string; // raw body; undefined for xitem
	section: string; // enclosing subsect() or sect()
}

export interface YodlSection {
	level: "sect" | "subsect";
	name: string;
	line: number;
}

const SPECIAL_MACROS: Record<string, string> = {
	"LPAR()": "(",
	"RPAR()": ")",
	"PLUS()": "+",
	"LSQUARE()": "[",
	"RSQUARE()": "]",
	"PIPE()": "|",
	"AMP()": "&",
	"HASH()": "#",
};

/** Replace yodl special macros with their literal characters */
function replaceSpecials(s: string): string {
	let r = s;
	for (const [macro, ch] of Object.entries(SPECIAL_MACROS)) {
		while (r.includes(macro)) r = r.replace(macro, ch);
	}
	return r;
}

/** Strip all yodl markup, returning plain text */
export function stripYodl(raw: string): string {
	let s = raw;
	// Remove COMMENT(...) blocks
	s = stripMacro(s, "COMMENT");
	// Strip wrapping macros: tt(), var(), em(), bf(), sectref(), nmref()
	for (const m of ["tt", "var", "em", "bf", "sectref", "nmref"]) {
		s = stripWrapperMacro(s, m);
	}
	// Strip index macros: cindex(), pindex(), findex()
	for (const m of ["cindex", "pindex", "findex"]) {
		s = stripMacro(s, m);
	}
	// Strip ifzman/ifnzman blocks
	for (const m of ["ifzman", "ifnzman"]) {
		s = stripMacro(s, m);
	}
	// Strip noderef
	s = stripMacro(s, "noderef");
	// Replace special macros
	s = replaceSpecials(s);
	// Clean up whitespace
	s = s.replace(/\n{3,}/g, "\n\n").trim();
	return s;
}

/** Remove macro(content) entirely (content discarded) */
function stripMacro(s: string, name: string): string {
	let r = s;
	const tag = `${name}(`;
	for (;;) {
		const idx = r.indexOf(tag);
		if (idx === -1) break;
		const end = findBalancedClose(r, idx + tag.length - 1);
		if (end === -1) break;
		r = r.slice(0, idx) + r.slice(end + 1);
	}
	return r;
}

/** Strip wrapper macro, keeping inner content: name(content) → content */
function stripWrapperMacro(s: string, name: string): string {
	let r = s;
	const tag = `${name}(`;
	for (;;) {
		const idx = r.indexOf(tag);
		if (idx === -1) break;
		const contentStart = idx + tag.length;
		const end = findBalancedClose(r, idx + tag.length - 1);
		if (end === -1) break;
		const content = r.slice(contentStart, end);
		r = r.slice(0, idx) + content + r.slice(end + 1);
	}
	return r;
}

/**
 * Find matching `)` for `(` at position `openPos`.
 * Tracks balanced parens. Returns index of closing `)`, or -1.
 */
export function findBalancedClose(s: string, openPos: number): number {
	let depth = 1;
	for (let i = openPos + 1; i < s.length; i++) {
		if (s[i] === "(") depth++;
		else if (s[i] === ")") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/** Extract item(header)(body) and xitem(header) entries */
export function extractItems(yo: string): YodlItem[] {
	const sections = extractSections(yo);
	const items: YodlItem[] = [];
	const lines = yo.split("\n");

	// Build section lookup: line number → section name
	function sectionAt(lineIdx: number): string {
		let sec = "";
		for (const s of sections) {
			if (s.line <= lineIdx) sec = s.name;
		}
		return sec;
	}

	// Process character by character to find item() and xitem()
	let pos = 0;
	while (pos < yo.length) {
		const xi = matchAt(yo, pos, "xitem(");
		const it = matchAt(yo, pos, "item(");
		if (xi) {
			const headerClose = findBalancedClose(yo, pos + 5); // after "xitem("
			if (headerClose === -1) {
				pos++;
				continue;
			}
			const header = yo.slice(pos + 6, headerClose);
			const lineIdx = lineOfPos(lines, pos);
			items.push({ header, section: sectionAt(lineIdx) });
			pos = headerClose + 1;
		} else if (it) {
			const headerClose = findBalancedClose(yo, pos + 4); // after "item("
			if (headerClose === -1) {
				pos++;
				continue;
			}
			const header = yo.slice(pos + 5, headerClose);
			// Check for body: item(header)(body)
			if (headerClose + 1 < yo.length && yo[headerClose + 1] === "(") {
				const bodyClose = findBalancedClose(yo, headerClose + 1);
				if (bodyClose !== -1) {
					const body = yo.slice(headerClose + 2, bodyClose);
					const lineIdx = lineOfPos(lines, pos);
					items.push({
						header,
						body: body.replace(/^\n/, ""),
						section: sectionAt(lineIdx),
					});
					pos = bodyClose + 1;
					continue;
				}
			}
			const lineIdx = lineOfPos(lines, pos);
			items.push({ header, section: sectionAt(lineIdx) });
			pos = headerClose + 1;
		} else {
			pos++;
		}
	}
	return items;
}

/** Extract sect()/subsect() headers with line positions */
export function extractSections(yo: string): YodlSection[] {
	const out: YodlSection[] = [];
	const lines = yo.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const sm = line.match(/^sect\((.+?)\)/);
		if (sm?.[1]) {
			out.push({ level: "sect", name: sm[1], line: i });
			continue;
		}
		const ssm = line.match(/^subsect\((.+?)\)/);
		if (ssm?.[1]) {
			out.push({ level: "subsect", name: ssm[1], line: i });
		}
	}
	return out;
}

function matchAt(s: string, pos: number, tag: string): boolean {
	if (pos + tag.length > s.length) return false;
	// must be at line start or preceded by whitespace/newline
	if (
		pos > 0 &&
		s[pos - 1] !== "\n" &&
		s[pos - 1] !== " " &&
		s[pos - 1] !== "\t"
	)
		return false;
	for (let i = 0; i < tag.length; i++) {
		if (s[pos + i] !== tag[i]) return false;
	}
	return true;
}

function lineOfPos(lines: string[], pos: number): number {
	let charCount = 0;
	for (let i = 0; i < lines.length; i++) {
		charCount += (lines[i]?.length ?? 0) + 1; // +1 for \n
		if (charCount > pos) return i;
	}
	return lines.length - 1;
}
