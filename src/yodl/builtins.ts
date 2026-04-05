import type { BuiltinDoc } from "../types/zsh-data";
import { extractItems, stripYodl } from "./parse";

/**
 * Parse builtins.yo → BuiltinDoc[]
 *
 * builtins.yo uses custom macros defined via def():
 * - alias(A)(B): builtin A is alias for B
 * - module(A)(B): builtin A is from module B
 * These are resolved by looking at the raw item body.
 */
export function parseBuiltins(yo: string): BuiltinDoc[] {
	const items = extractItems(yo);
	const docs: BuiltinDoc[] = [];

	// Track findex entries — the builtin name precedes item groups
	const _findexes = extractFindexes(yo);

	// Track pending synopsis lines from xitems
	let pendingSynopsis: string[] = [];

	for (const item of items) {
		const synopsis = stripSynopsis(item.header);

		if (!item.body) {
			// xitem — extra synopsis line
			if (synopsis) pendingSynopsis.push(synopsis);
			continue;
		}

		const allSynopsis = [...pendingSynopsis, synopsis].filter(Boolean);
		pendingSynopsis = [];

		if (allSynopsis.length === 0) continue;

		// Derive builtin name from the first synopsis
		// biome-ignore lint/style/noNonNullAssertion: length > 0 checked above
		const name = extractCmdName(allSynopsis[0]!);
		if (!name) continue;

		// Check body for alias/module macros
		const aliasOf = extractAlias(item.body);
		const module = extractModule(item.body);

		const desc = aliasOf
			? `Same as ${aliasOf}.`
			: `${stripYodl(item.body).replace(/\n+/g, " ").trim().split(/\.\s/)[0]}.`;

		docs.push({
			name,
			synopsis: allSynopsis,
			desc: desc.slice(0, 300), // truncate long descriptions
			...(module && { module }),
			...(aliasOf && { aliasOf }),
		});
	}

	return docs;
}

function extractFindexes(yo: string): string[] {
	const out: string[] = [];
	for (const m of yo.matchAll(/findex\(([^)]+)\)/g)) {
		if (m[1]) out.push(m[1]);
	}
	return out;
}

function stripSynopsis(header: string): string {
	return stripYodl(header).trim();
}

function extractCmdName(synopsis: string): string | undefined {
	// First word of synopsis (the command name)
	const m = synopsis.match(/^(\S+)/);
	return m?.[1];
}

function extractAlias(body: string): string | undefined {
	const m = body.match(/Same as tt\(([^)]+)\)/);
	return m?.[1];
}

function extractModule(body: string): string | undefined {
	const m = body.match(/See (?:ifzman|ifnzman)\(.*?The (\S+) Module/);
	return m?.[1];
}
