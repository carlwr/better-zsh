import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import * as path from "node:path";
import { log, warn } from "./log";
import {
	buildZshEnv,
	execZsh,
	runZshScript as runZshScriptRaw,
	ZSH_BASE_ARGS,
	ZSH_VERSION_ARGS,
} from "./zsh-exec";

export const WORD = /[\w][\w-]*/g;
export const WORD_EXACT = /^[\w][\w-]*$/;

let zshBinary = "zsh";
let zshDisabled = false;

/** Update zsh binary path from settings. Call on activation and config change. */
export function setZshPath(setting: string) {
	if (setting === "off") {
		zshDisabled = true;
		zshBinary = "zsh"; // unused when disabled
	} else {
		zshDisabled = false;
		zshBinary = setting || "zsh";
	}
}

export function isZshDisabled() {
	return zshDisabled;
}
let zshInfoLogged = false;

export function escRe(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { buildZshEnv } from "./zsh-exec";

export function parseZshError(
	stderr: string,
): { line: number; msg: string } | undefined {
	if (!stderr.trim()) return undefined;
	const m = stderr.match(/^(?:\/dev\/stdin|zsh):(\d+):\s*(.+)$/m);
	if (m) return { line: Number(m[1]), msg: m[2] ?? "" };
	return { line: 1, msg: stderr.trim() };
}

export function filterTokens(tokens: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of tokens) {
		if (WORD_EXACT.test(t) && !seen.has(t)) {
			seen.add(t);
			out.push(t);
		}
	}
	return out;
}

function execZshLogged({
	args,
	env,
	stdin,
}: {
	args: string[];
	env?: NodeJS.ProcessEnv;
	stdin?: string;
}) {
	// Keep all zsh process spawning centralized so the environment contract is
	// easy to inspect in one place; that is safer and more transparent than
	// scattering ad-hoc exec calls across features.
	return execZsh(zshBinary, { args, env, stdin });
}

function resolveZshPath(env: NodeJS.ProcessEnv): string | undefined {
	const pathValue = env.PATH;
	if (!pathValue) return undefined;
	const dirs = pathValue.split(path.delimiter).filter(Boolean);
	const exts =
		process.platform === "win32"
			? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
			: [""];
	for (const dir of dirs) {
		for (const ext of exts) {
			const full = path.join(dir, `${zshBinary}${ext}`);
			if (existsSync(full)) return full;
		}
	}
	return undefined;
}

async function canExec(file: string) {
	try {
		await access(file, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function logZshVersion(r: { stdout: string; stderr: string; code: number }) {
	if (r.code === 0) {
		const version = r.stdout.trim() || r.stderr.trim();
		if (version) log(`zsh version: ${version}`);
		return;
	}
	warn(`failed to read zsh version (exit ${r.code})`);
}

function maybeLogZshInfo(
	env: NodeJS.ProcessEnv | undefined,
	args: string[],
	result?: { stdout: string; stderr: string; code: number },
) {
	if (zshInfoLogged) return;
	zshInfoLogged = true;
	const zshEnv = buildZshEnv(process.env, env);
	const resolved = resolveZshPath(zshEnv);
	if (resolved) {
		void canExec(resolved).then((ok) =>
			log(`zsh path: ${resolved}${ok ? "" : " (not executable)"}`),
		);
	} else {
		log("zsh path: unresolved (using PATH lookup)");
	}
	if (args.length === 1 && args[0] === "--version" && result) {
		logZshVersion(result);
		return;
	}
	void execZsh(zshBinary, { args: ZSH_VERSION_ARGS }).then(logZshVersion);
}

function runZshScript(script: string, env?: NodeJS.ProcessEnv) {
	return runZshScriptRaw(zshBinary, script, env).then((r) => {
		maybeLogZshInfo(env, ZSH_BASE_ARGS);
		return r;
	});
}

function runZsh({
	args,
	env,
	stdin,
}: {
	args: string[];
	env?: NodeJS.ProcessEnv;
	stdin?: string;
}) {
	return execZshLogged({ args, env, stdin }).then((r) => {
		maybeLogZshInfo(env, args, r);
		return r;
	});
}

export async function zshAvailable(): Promise<boolean> {
	if (zshDisabled) {
		log("zsh invocation disabled by betterZsh.zshPath = off");
		return false;
	}
	const r = await runZsh({ args: ZSH_VERSION_ARGS });
	const ok = r.code === 0;
	if (!ok) warn("zsh not found on PATH; zsh-dependent features disabled");
	return ok;
}

export async function zshCheck(
	text: string,
): Promise<{ ok: true } | { ok: false; line: number; msg: string }> {
	const r = await runZsh({ args: [...ZSH_BASE_ARGS, "-n"], stdin: text });
	if (r.code === 0) return { ok: true };
	const parsed = parseZshError(r.stderr);
	if (parsed) return { ok: false, ...parsed };
	warn("zsh -n: unexpected stderr format");
	return { ok: false, line: 1, msg: "syntax error" };
}

export async function zshTokenize(text: string): Promise<string[]> {
	const r = await runZshScript('print -l -- "${(Z+Cn+)SRC}"', { SRC: text });
	if (r.code !== 0) return [];
	return r.stdout.split("\n").filter(Boolean);
}

export async function zshBuiltins(): Promise<string[]> {
	const r = await runZshScript("print -l -- ${(k)builtins}");
	if (r.code !== 0) {
		warn("failed to query zsh builtins");
		return [];
	}
	return r.stdout.split("\n").filter(Boolean);
}

export async function zshReswords(): Promise<string[]> {
	const r = await runZshScript("print -l -- ${(k)reswords}");
	if (r.code !== 0) {
		warn("failed to query zsh reswords");
		return [];
	}
	return r.stdout.split("\n").filter(Boolean);
}

export async function zshOptions(): Promise<string[]> {
	const r = await runZshScript("print -l -- ${(k)options}");
	if (r.code !== 0) {
		warn("failed to query zsh options");
		return [];
	}
	return r.stdout.split("\n").filter(Boolean);
}

export async function zshParameters(): Promise<Map<string, string>> {
	const r = await runZshScript(
		'zmodload zsh/parameter; for k v in ${(kv)parameters}; do [[ $v == *special* && $v != *hide* ]] && print "$k=$v"; done',
	);
	if (r.code !== 0) {
		warn("failed to query zsh parameters");
		return new Map();
	}
	const m = new Map<string, string>();
	for (const line of r.stdout.split("\n")) {
		const eq = line.indexOf("=");
		if (eq > 0) m.set(line.slice(0, eq), line.slice(eq + 1));
	}
	return m;
}
