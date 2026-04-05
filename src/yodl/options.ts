import { mkOptFlagChar, mkOptName } from "../types/brand";
import type {
	DefaultMarker,
	Emulation,
	OptFlagAlias,
	OptFlagSign,
	ZshOption,
} from "../types/zsh-data";
import {
	extractItems,
	normalizeDoc,
	replaceSpecials,
	stripYodl,
} from "./parse";

const VALID_DEFAULTS = new Set<string>(["D", "K", "S", "C", "Z"]);

const OPT_NAME_RE = /tt\(([A-Z_]+)\)/;
const DEFAULT_RE = /<([DKSCZ])>/g;
const HEADER_FLAG_RE = /^[+-][A-Za-z0-9]$/;
const SITEM_RE = /^sitem\(tt\(([^)]+)\)\)\((.+)\)$/;
const ALL_EMULATIONS: readonly Emulation[] = ["csh", "ksh", "sh", "zsh"];

/** Parse options.yo → ZshOption[] */
export function parseOptions(yo: string): ZshOption[] {
	const items = extractItems(yo);
	const flagMap = parseDefaultFlagAliases(yo);
	const opts: ZshOption[] = [];
	for (const item of items) {
		if (!item.body) continue; // xitems and bodyless items aren't option definitions
		const nm = item.header.match(OPT_NAME_RE);
		if (!nm?.[1]) continue;
		const display = nm[1];
		const name = mkOptName(display);

		const defaults: DefaultMarker[] = [];
		for (const m of item.header.matchAll(DEFAULT_RE)) {
			if (m[1] && VALID_DEFAULTS.has(m[1]))
				defaults.push(m[1] as DefaultMarker);
		}

		const headerFlag = parseHeaderFlag(item.header);
		const flags = flagMap.get(name) ?? (headerFlag ? [headerFlag] : []);
		const desc = normalizeDoc(stripYodl(item.body));
		const category = item.section;

		opts.push({
			name,
			display,
			flags,
			defaultIn: emulationsFor(defaults),
			category,
			desc,
		});
	}
	return opts;
}

function parseHeaderFlag(header: string): OptFlagAlias | undefined {
	const parts = [...replaceSpecials(header).matchAll(/tt\(([^)]+)\)/g)]
		.map((m) => m[1]?.trim())
		.filter(Boolean);
	for (const part of parts.slice(1)) {
		if (!part || !HEADER_FLAG_RE.test(part)) continue;
		const on = part[0] as OptFlagSign;
		const char = part[1];
		if (!char) continue;
		return { char: mkOptFlagChar(char), on };
	}
	return undefined;
}

function parseDefaultFlagAliases(
	yo: string,
): Map<string, readonly OptFlagAlias[]> {
	const lines = defaultSetBlock(yo).split("\n");
	const out = new Map<string, readonly OptFlagAlias[]>();
	for (const line of lines) {
		const m = line.trim().match(SITEM_RE);
		if (!m?.[1] || !m[2]) continue;
		const flag = stripYodl(`tt(${m[1]})`).trim();
		const target = stripYodl(m[2]).trim();
		const alias = aliasFrom(flag, target);
		if (!alias) continue;
		const key = mkOptName(alias.display);
		out.set(key, [alias.flag]);
	}
	return out;
}

function defaultSetBlock(yo: string): string {
	const start = yo.indexOf("subsect(Default set)");
	if (start === -1) return "";
	const fromItems = yo.indexOf("startsitem()", start);
	if (fromItems === -1) return "";
	const end = yo.indexOf("endsitem()", fromItems);
	return yo.slice(fromItems, end === -1 ? undefined : end);
}

function aliasFrom(
	flag: string,
	target: string,
): { display: string; flag: OptFlagAlias } | undefined {
	if (!HEADER_FLAG_RE.test(flag)) return undefined;
	const listed = flag[0] as OptFlagSign;
	const char = flag[1];
	if (!char) return undefined;

	const positive = target.startsWith("NO_") ? opposite(listed) : listed;
	const display = target.replace(/^NO_/, "");

	return {
		display,
		flag: {
			char: mkOptFlagChar(char),
			on: positive,
		},
	};
}

function opposite(sign: OptFlagSign): OptFlagSign {
	return sign === "-" ? "+" : "-";
}

function emulationsFor(
	defaults: readonly DefaultMarker[],
): readonly Emulation[] {
	const out = new Set<Emulation>();
	for (const d of defaults) {
		if (d === "D") {
			for (const emu of ALL_EMULATIONS) out.add(emu);
			continue;
		}
		if (d === "C") out.add("csh");
		if (d === "K") out.add("ksh");
		if (d === "S") out.add("sh");
		if (d === "Z") out.add("zsh");
	}
	return [...out];
}
