export interface CmdPos {
	start: number;
	end: number;
}

/** Words that don't consume the command slot — next word is also in command position. */
const TRANSPARENT = new Set([
	"do",
	"then",
	"else",
	"elif",
	"!",
	"{",
	"if",
	"while",
	"until",
	"time",
]);

/** Shell reserved words — appear in command position but aren't real commands. */
const RESERVED = new Set([
	"if",
	"then",
	"else",
	"elif",
	"fi",
	"for",
	"in",
	"while",
	"until",
	"do",
	"done",
	"case",
	"esac",
	"select",
	"coproc",
	"function",
	"!",
	"{",
	"}",
	"[[",
	"]]",
	"time",
]);
/**
 * Returns character ranges of tokens in command position on a single line.
 * `commentAt` is the index where a `#` comment starts, or undefined.
 */
export function cmdPositions(line: string, commentAt?: number): CmdPos[] {
	const len = commentAt ?? line.length;
	const out: CmdPos[] = [];
	let i = 0;
	let expectCmd = true;

	while (i < len) {
		i = skipWhitespace(line, i, len);
		if (i >= len) break;

		const ch = line.charAt(i);

		// Operators that reset command expectation
		if (ch === ";" || ch === "(" || ch === "\n") {
			expectCmd = true;
			i++;
			continue;
		}
		if (ch === "|") {
			expectCmd = true;
			i++;
			if (i < len && line[i] === "|") i++; // ||
			continue;
		}
		if (ch === "&" && i + 1 < len && line[i + 1] === "&") {
			expectCmd = true;
			i += 2;
			continue;
		}

		// Redirections: optional leading fd digit, then >, <, >>, >&, etc.
		const redirLen = matchRedirection(line, i, len);
		if (redirLen > 0) {
			i += redirLen;
			// Skip whitespace then skip the target word (not a command, doesn't change expectCmd)
			i = skipWhitespace(line, i, len);
			i = skipWord(line, i, len);
			continue;
		}

		// Regular word
		const wStart = i;
		i = skipWord(line, i, len);
		if (i === wStart) {
			// Unknown char (e.g. `)`), just advance
			i++;
			continue;
		}
		const word = line.slice(wStart, i);

		if (expectCmd) {
			const fnEnd = matchFuncDef(line, i, len);
			if (fnEnd !== undefined) {
				i = fnEnd;
				continue;
			}
			if (RESERVED.has(word)) {
				// Reserved words are not real commands; transparent ones keep expectCmd true
				expectCmd = TRANSPARENT.has(word);
			} else {
				out.push({ start: wStart, end: i });
				expectCmd = false;
			}
		} else if (word === "}" || word === ")") {
			// Closing delimiters — next token could be in command position after `;` etc.
			// Don't set expectCmd here; it will be set by the following `;`/`|`/etc.
		}
	}

	return out;
}

function skipWhitespace(s: string, i: number, len: number): number {
	while (i < len && (s[i] === " " || s[i] === "\t")) i++;
	return i;
}

/** Advance past a word (non-whitespace, non-operator chars). Handles quotes. */
function skipWord(s: string, i: number, len: number): number {
	const start = i;
	while (i < len) {
		const ch = s.charAt(i);
		if (ch === " " || ch === "\t") break;
		if (
			ch === ";" ||
			ch === "|" ||
			ch === "&" ||
			ch === "(" ||
			ch === ")" ||
			ch === "\n"
		)
			break;
		// Don't consume `>` or `<` inside a word — they're operators
		if (ch === ">" || ch === "<") break;
		if (ch === "{" && i !== start) break;
		if (ch === "}" && i !== start) break;
		if (ch === "'") {
			i = skipSingleQuote(s, i, len);
			continue;
		}
		if (ch === '"') {
			i = skipDoubleQuote(s, i, len);
			continue;
		}
		if (ch === "\\") {
			i += 2;
			continue;
		}
		i++;
	}
	return i;
}

function skipSingleQuote(s: string, i: number, len: number): number {
	i++; // opening '
	while (i < len && s[i] !== "'") i++;
	if (i < len) i++; // closing '
	return i;
}

function skipDoubleQuote(s: string, i: number, len: number): number {
	i++; // opening "
	while (i < len && s[i] !== '"') {
		if (s[i] === "\\") i++;
		i++;
	}
	if (i < len) i++; // closing "
	return i;
}

function matchFuncDef(s: string, i: number, len: number): number | undefined {
	let pos = i;
	while (pos < len && (s[pos] === " " || s[pos] === "\t")) pos++;
	if (pos + 1 >= len || s[pos] !== "(" || s[pos + 1] !== ")") return;
	return pos + 2;
}

/**
 * If position `i` starts a redirection operator, return the length of the operator
 * (not including the target word). Returns 0 if no redirection.
 *
 * Forms: > >> >| >>| < << <<< <( >( >& <& N> N>> N< N>& N<&
 */
function matchRedirection(s: string, i: number, len: number): number {
	let pos = i;

	// Optional leading fd digit
	if (pos < len && s.charAt(pos) >= "0" && s.charAt(pos) <= "9") {
		const next = pos + 1;
		if (next < len && (s[next] === ">" || s[next] === "<")) {
			pos = next;
		}
		// If digit not followed by > or <, it's not a redirection
	}

	if (pos >= len) return 0;
	const ch = s.charAt(pos);

	if (ch === ">") {
		pos++;
		if (pos < len && s[pos] === ">") pos++; // >>
		if (pos < len && s[pos] === "|") pos++; // >| or >>|
		if (pos < len && s[pos] === "&") pos++; // >& or >&
		return pos - i;
	}

	if (ch === "<") {
		pos++;
		if (pos < len && s[pos] === "<") {
			pos++;
			if (pos < len && s[pos] === "<") pos++; // <<<
			return pos - i;
		}
		if (pos < len && s[pos] === "&") pos++; // <&
		if (pos < len && s[pos] === "(") return 0; // <( is process substitution, not handled as simple redir
		return pos - i;
	}

	return 0;
}
