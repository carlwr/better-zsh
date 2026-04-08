export const ZSH_VERSION_ARGS = ["--version"] as const
/** Base args for all zsh invocations: `-f` (NO_RCS) to skip user rc files. */
export const ZSH_BASE_ARGS = ["-f"] as const

const TOKENIZE_SCRIPT = 'print -l -- "${(Z+Cn+)SRC}"'
const BUILTINS_SCRIPT = "print -l -- ${(k)builtins}"
const RESWORDS_SCRIPT = "print -l -- ${(k)reswords}"
const OPTIONS_SCRIPT = "print -l -- ${(k)options}"
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

/** Ask zsh to tokenize source text. */
export async function zshTokenize(
  run: ZshRunner,
  text: string,
): Promise<string[] | undefined> {
  const r = await runZshScript(run, TOKENIZE_SCRIPT, { SRC: text })
  return r.code === 0 ? splitLines(r.stdout) : undefined
}

/** Query builtin command names known to zsh. */
export async function zshBuiltins(
  run: ZshRunner,
): Promise<string[] | undefined> {
  const r = await runZshScript(run, BUILTINS_SCRIPT)
  return r.code === 0 ? splitLines(r.stdout) : undefined
}

/** Query reserved words known to zsh. */
export async function zshReswords(
  run: ZshRunner,
): Promise<string[] | undefined> {
  const r = await runZshScript(run, RESWORDS_SCRIPT)
  return r.code === 0 ? splitLines(r.stdout) : undefined
}

/** Query option names known to zsh. */
export async function zshOptions(
  run: ZshRunner,
): Promise<string[] | undefined> {
  const r = await runZshScript(run, OPTIONS_SCRIPT)
  return r.code === 0 ? splitLines(r.stdout) : undefined
}

/** Query visible special parameters known to zsh. */
export async function zshParameters(
  run: ZshRunner,
): Promise<Map<string, string> | undefined> {
  const r = await runZshScript(run, PARAMS_SCRIPT)
  return r.code === 0 ? parseEqMap(r.stdout) : undefined
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
