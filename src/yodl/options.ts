import { mkOptLetter, mkOptName } from "../types/brand";
import type { DefaultMarker, ZshOption } from "../types/zsh-data";
import { extractItems, stripYodl } from "./parse";

const VALID_DEFAULTS = new Set<string>(["D", "K", "S", "C", "Z"]);

const OPT_NAME_RE = /tt\(([A-Z_]+)\)/;
const LETTER_RE = /\(tt\(-(\w)\)\)/;
const DEFAULT_RE = /<([DKSCZ])>/g;

/** Parse options.yo → ZshOption[] */
export function parseOptions(yo: string): ZshOption[] {
	const items = extractItems(yo);
	const opts: ZshOption[] = [];
	for (const item of items) {
		if (!item.body) continue; // xitems and bodyless items aren't option definitions
		const nm = item.header.match(OPT_NAME_RE);
		if (!nm?.[1]) continue;
		const display = nm[1];
		const name = mkOptName(display);

		const letterMatch = item.header.match(LETTER_RE);
		const letter = letterMatch?.[1] ? mkOptLetter(letterMatch[1]) : undefined;

		const defaults: DefaultMarker[] = [];
		for (const m of item.header.matchAll(DEFAULT_RE)) {
			if (m[1] && VALID_DEFAULTS.has(m[1]))
				defaults.push(m[1] as DefaultMarker);
		}

		const desc = stripYodl(item.body).replace(/\n+/g, " ").trim();
		const category = item.section;

		opts.push({ name, display, letter, defaults, category, desc });
	}
	return opts;
}
