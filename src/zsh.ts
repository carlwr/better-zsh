import { execFile } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import * as path from "node:path";
import { log, warn } from "./log";

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
const ZSH_VERSION_ARGS = ["--version"];
const ZSH_BASE_ARGS = ["-f"];
const ZSH_ENV_KEEP = [
	"HOME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"LC_MESSAGES",
	"LOGNAME",
	"PATH",
	"PWD",
	"SHELL",
	"TEMP",
	"TMP",
	"TMPDIR",
	"USER",
	"USERNAME",
] as const;
const ZSH_ENV_KEEP_WIN32 = [
	"ComSpec",
	"COMSPEC",
	"PATHEXT",
	"SystemRoot",
	"SYSTEMROOT",
	"USERPROFILE",
] as const;
const ZSH_ENV_DROP = ["BASH_ENV", "ENV", "FPATH", "ZDOTDIR"] as const;
let zshInfoLogged = false;

export function escRe(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildZshEnv(
	src: NodeJS.ProcessEnv,
	extra?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = {};
	const keys =
		process.platform === "win32"
			? [...ZSH_ENV_KEEP, ...ZSH_ENV_KEEP_WIN32]
			: ZSH_ENV_KEEP;
	for (const k of keys) {
		const v = src[k];
		if (v !== undefined) out[k] = v;
	}
	if (extra) {
		for (const [k, v] of Object.entries(extra)) {
			if (v !== undefined) out[k] = v;
		}
	}
	for (const k of ZSH_ENV_DROP) delete out[k];
	return out;
}

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

function helper(script: string) {
	return `emulate -LR zsh\n${script}`;
}

function execZsh({
	args,
	env,
	stdin,
}: {
	args: string[];
	env?: NodeJS.ProcessEnv;
	stdin?: string;
}): Promise<{ stdout: string; stderr: string; code: number }> {
	return new Promise((resolve) => {
		// Keep all zsh process spawning centralized so the environment contract is
		// easy to inspect in one place; that is safer and more transparent than
		// scattering ad-hoc exec calls across features.
		const proc = execFile(
			zshBinary,
			args,
			{
				timeout: 5000,
				maxBuffer: 1024 * 1024,
				env: buildZshEnv(process.env, env),
			},
			(err, stdout, stderr) => {
				const e = err as (NodeJS.ErrnoException & { status?: number }) | null;
				resolve({ stdout, stderr, code: e ? (e.status ?? 1) : 0 });
			},
		);
		if (stdin !== undefined) proc.stdin?.end(stdin);
	});
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
	void execZsh({ args: ZSH_VERSION_ARGS }).then(logZshVersion);
}

function runZshScript(script: string, env?: NodeJS.ProcessEnv) {
	return runZsh({ args: [...ZSH_BASE_ARGS, "-c", helper(script)], env });
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
	return execZsh({ args, env, stdin }).then((r) => {
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
