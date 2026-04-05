import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cached } from "@carlwr/typescript-extra";
import type { BuiltinDoc, CondOperator, ZshOption } from "./types/zsh-data";
import { parseBuiltins } from "./yodl/builtins";
import { parseCondOps } from "./yodl/cond-ops";
import { parseOptions } from "./yodl/options";

let dataDir = "";

/** Call once during activation with context.extensionPath */
export function initZshData(extensionPath: string) {
	dataDir = join(extensionPath, "src", "data", "zsh-docs");
}

function readYo(name: string): string {
	return readFileSync(join(dataDir, name), "utf8");
}

export const getOptions = cached<ZshOption[]>(() =>
	parseOptions(readYo("options.yo")),
);

export const getCondOps = cached<CondOperator[]>(() =>
	parseCondOps(readYo("cond.yo")),
);

export const getBuiltins = cached<BuiltinDoc[]>(() =>
	parseBuiltins(readYo("builtins.yo")),
);
