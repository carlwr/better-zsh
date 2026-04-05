import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HoverDoc, HoverKind } from "./hover-md";

export type HoverDumpFile =
	| "all.md"
	| "options.md"
	| "cond-ops.md"
	| "params.md";

const dumpFiles: readonly [HoverKind | "all", HoverDumpFile][] = [
	["all", "all.md"],
	["option", "options.md"],
	["cond-op", "cond-ops.md"],
	["param", "params.md"],
];

function section(doc: HoverDoc): string {
	return `## ${doc.key}\n\n${doc.md}`;
}

export function dumpText(
	docs: readonly HoverDoc[],
): Map<HoverDumpFile, string> {
	const byKind = new Map<HoverKind, HoverDoc[]>([
		["option", []],
		["cond-op", []],
		["param", []],
	]);
	for (const doc of docs) byKind.get(doc.kind)?.push(doc);

	return new Map(
		dumpFiles.map(([kind, file]) => [
			file,
			(kind === "all" ? docs : (byKind.get(kind) ?? []))
				.map(section)
				.join("\n\n---\n\n")
				.concat("\n"),
		]),
	);
}

export async function writeHoverDump(
	dir: string,
	docs: readonly HoverDoc[],
): Promise<void> {
	await mkdir(dir, { recursive: true });
	for (const [file, text] of dumpText(docs)) {
		await writeFile(join(dir, file), text, "utf8");
	}
}
