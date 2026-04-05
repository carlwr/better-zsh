import type { CondOp, OptLetter, OptName } from "./brand";

/** Default-on marker from zshoptions: <D>=default, <K>=ksh, <S>=sh, <C>=csh, <Z>=zsh */
export type DefaultMarker = "D" | "K" | "S" | "C" | "Z";

/** Conditional expression: unary (-a file) vs binary (f1 -nt f2) */
export type CondKind = "unary" | "binary";

export interface ZshOption {
	name: OptName;
	display: string; // "AUTO_CD" — UPPER_CASE from docs
	letter?: OptLetter;
	defaults: DefaultMarker[];
	category: string; // "Changing Directories"
	desc: string;
}

export interface CondOperator {
	op: CondOp; // "-a", "-nt", "=~"
	operands: string[]; // ["file"], ["file1", "file2"]
	desc: string;
	kind: CondKind;
}

export interface BuiltinDoc {
	name: string;
	synopsis: string[];
	desc: string;
	module?: string;
	aliasOf?: string;
}
