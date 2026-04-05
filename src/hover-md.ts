import type { CondOperator, ZshOption } from "./types/zsh-data";

export type HoverKind = "option" | "cond-op" | "param";

export interface HoverDoc {
	kind: HoverKind;
	key: string;
	md: string;
}

export interface HoverRegression {
	kind: HoverKind;
	key: string;
	note: string;
}

// Add known markdown/render regressions here as they are discovered.
export const hoverMdRegressions: HoverRegression[] = [];

export function fmtParamType(raw: string): string {
	const parts = raw.split("-");
	const base = parts[0] ?? raw;
	const flags: string[] = [];
	if (parts.includes("readonly")) flags.push("readonly");
	if (parts.includes("tied")) flags.push("tied");
	if (parts.includes("export")) flags.push("exported");
	return flags.length ? `${base} (${flags.join(", ")})` : base;
}

export function mdOpt(opt: ZshOption): string {
	const letter = opt.letter ? ` (\`-${opt.letter}\`)` : "";
	const defaults =
		opt.defaults.length > 0 ? ` <${opt.defaults.join(", ")}>` : "";
	return `\`${opt.display}\`${letter}${defaults}\n\n${opt.desc}\n\n_Category:_ ${opt.category}`;
}

export function sigCond(cop: CondOperator): string {
	return cop.kind === "unary"
		? `\`${cop.op}\` *${cop.operands.join(" ")}*`
		: `*${cop.operands[0] ?? ""}* \`${cop.op}\` *${cop.operands[1] ?? ""}*`;
}

export function mdCond(cop: CondOperator): string {
	return `${sigCond(cop)}\n\n${cop.desc}`;
}

export function mdParam(name: string, raw: string): string {
	return `\`${name}\`: ${fmtParamType(raw)} — zsh special parameter`;
}

export function hoverDocs({
	options,
	condOps,
	params,
}: {
	options: readonly ZshOption[];
	condOps: readonly CondOperator[];
	params: ReadonlyMap<string, string>;
}): HoverDoc[] {
	const paramDocs = [...params.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, raw]) => ({
			kind: "param" as const,
			key,
			md: mdParam(key, raw),
		}));

	return [
		...options.map((opt) => ({
			kind: "option" as const,
			key: opt.display,
			md: mdOpt(opt),
		})),
		...condOps.map((cop) => ({
			kind: "cond-op" as const,
			key: cop.op as string,
			md: mdCond(cop),
		})),
		...paramDocs,
	];
}
