import { mkCondOp } from "../types/brand";
import type { CondKind, CondOperator } from "../types/zsh-data";
import { extractItems, normalizeDoc, stripYodl } from "./parse";

/** Parse cond.yo → CondOperator[] */
export function parseCondOps(yo: string): CondOperator[] {
	const items = extractItems(yo);
	const ops: CondOperator[] = [];
	// track pending xitems — they are aliases for the next item
	let pending: string[] = [];

	for (const item of items) {
		const parsed = parseHeader(item.header);
		if (!parsed) {
			pending = [];
			continue;
		}

		if (!item.body) {
			// xitem — accumulate as alias
			pending.push(parsed.op);
			continue;
		}

		const desc = normalizeDoc(stripYodl(item.body));
		// push the main op
		ops.push({
			op: mkCondOp(parsed.op),
			operands: parsed.operands,
			desc,
			kind: parsed.kind,
		});
		// push pending aliases (xitems before this item)
		for (const alias of pending) {
			ops.push({
				op: mkCondOp(alias),
				operands: parsed.operands,
				desc,
				kind: parsed.kind,
			});
		}
		pending = [];
	}
	return ops;
}

function parseHeader(
	header: string,
): { op: string; operands: string[]; kind: CondKind } | undefined {
	const tokens: { type: "tt" | "var"; val: string }[] = [];
	header.replace(
		/(?:tt|var)\(([^)]*(?:\([^)]*\))*[^)]*)\)/g,
		(match, content) => {
			const type = match.startsWith("tt") ? "tt" : "var";
			let val = content as string;
			val = val.replace(/LPAR\(\)/g, "(");
			val = val.replace(/RPAR\(\)/g, ")");
			val = val.replace(/PLUS\(\)/g, "+");
			val = val.replace(/LSQUARE\(\)/g, "[");
			val = val.replace(/RSQUARE\(\)/g, "]");
			val = val.replace(/PIPE\(\)/g, "|");
			tokens.push({ type: type as "tt" | "var", val });
			return "";
		},
	);

	const opIdx = tokens.findIndex(
		(t) => t.type === "tt" && /^[-=!<>~|&]|^\w/.test(t.val),
	);
	if (opIdx === -1) return undefined;
	// biome-ignore lint/style/noNonNullAssertion: opIdx !== -1 checked above
	const op = tokens[opIdx]!.val;

	const operands = tokens.filter((t) => t.type === "var").map((t) => t.val);

	const varsBefore = tokens.slice(0, opIdx).filter((t) => t.type === "var");
	const kind: CondKind = varsBefore.length > 0 ? "binary" : "unary";

	return { op, operands, kind };
}
