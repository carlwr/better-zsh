export const ZSH_VERSION_ARGS = ["--version"] as const
/** Base args for all zsh invocations: `-f` (NO_RCS) to skip user rc files. */
export const ZSH_BASE_ARGS = ["-f"] as const

// (Z+Cn+): split into shell tokens (Z flag), treating newlines as tokens (C),
// and keeping null tokens from adjacent delimiters (n) — yields one token per line.
const TOKENIZE_SCRIPT = 'print -l -- "${(Z+Cn+)SRC}"'
// (k): expand hash keys only — lists names of all builtins.
const BUILTINS_SCRIPT = "print -l -- ${(k)builtins}"
// (k): expand keys of the reswords special hash — lists reserved words.
const RESWORDS_SCRIPT = "print -l -- ${(k)reswords}"
// (k): expand keys of the options special hash — lists option names.
const OPTIONS_SCRIPT = "print -l -- ${(k)options}"
// Query visible special parameters: loads zsh/parameter, then prints key=value
// for each entry whose flags include "special" but not "hide".
const PARAMS_SCRIPT =
  'zmodload zsh/parameter; for k v in ${(kv)parameters}; do [[ $v == *special* && $v != *hide* ]] && print "$k=$v"; done'

/** Request shape for a zsh process invocation. */
export interface ZshRunReq {
  args: string[]
  env?: NodeJS.ProcessEnv
  stdin?: string
}

/** Normalized zsh process result. */
export interface ZshRunResult {
  stdout: string
  stderr: string
  code: number
  /**
   * Optional symbolic error code (e.g. `"ENOENT"`).
   * zsh-core's own runners leave this unset; it is a convention slot for custom
   * `ZshRunner` implementors that want to surface shell-level or OS-level error codes.
   */
  errCode?: string
}

/** Injected zsh executor used by the query helpers. */
export type ZshRunner = (req: ZshRunReq) => Promise<ZshRunResult>

/** Parse common zsh syntax-check stderr into a line/message pair. */
export function parseZshError(
  stderr: string,
): { line: number; msg: string } | undefined {
  if (!stderr.trim()) return undefined
  const m = stderr.match(/^(?:\/dev\/stdin|zsh):(\d+):\s*(.+)$/m)
  if (m) return { line: Number(m[1]), msg: m[2] ?? "" }
  return { line: 1, msg: stderr.trim() }
}

/** Run a zsh script under `emulate -LR zsh` with `-f`. */
export function runZshScript(
  run: ZshRunner,
  script: string,
  env?: NodeJS.ProcessEnv,
): Promise<ZshRunResult> {
  return run({
    args: [...ZSH_BASE_ARGS, "-c", `emulate -LR zsh\n${script}`],
    env,
  })
}

/** Query the zsh version banner. */
export function runZshVersion(run: ZshRunner): Promise<ZshRunResult> {
  return run({ args: [...ZSH_VERSION_ARGS] })
}

async function runZshQuery<T>(
  run: ZshRunner,
  script: string,
  parse: (stdout: string) => T,
  env?: NodeJS.ProcessEnv,
): Promise<T | undefined> {
  const r = await runZshScript(run, script, env)
  return r.code === 0 ? parse(r.stdout) : undefined
}

/** Ask zsh to tokenize source text. */
export async function zshTokenize(
  run: ZshRunner,
  text: string,
): Promise<string[] | undefined> {
  return runZshQuery(run, TOKENIZE_SCRIPT, splitLines, { SRC: text })
}

/** Query builtin command names known to zsh. */
export async function zshBuiltins(
  run: ZshRunner,
): Promise<string[] | undefined> {
  return runZshQuery(run, BUILTINS_SCRIPT, splitLines)
}

/** Query reserved words known to zsh. */
export async function zshReswords(
  run: ZshRunner,
): Promise<string[] | undefined> {
  return runZshQuery(run, RESWORDS_SCRIPT, splitLines)
}

/** Query option names known to zsh. */
export async function zshOptions(
  run: ZshRunner,
): Promise<string[] | undefined> {
  return runZshQuery(run, OPTIONS_SCRIPT, splitLines)
}

/** Query visible special parameters known to zsh. */
export async function zshParameters(
  run: ZshRunner,
): Promise<Map<string, string> | undefined> {
  return runZshQuery(run, PARAMS_SCRIPT, parseEqMap)
}

function splitLines(stdout: string): string[] {
  return stdout.split("\n").filter(Boolean)
}

function parseEqMap(stdout: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of splitLines(stdout)) {
    const eq = line.indexOf("=")
    if (eq > 0) out.set(line.slice(0, eq), line.slice(eq + 1))
  }
  return out
}
