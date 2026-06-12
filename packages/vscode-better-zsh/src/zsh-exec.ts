import { execFile } from "node:child_process"

/** Request shape for a single zsh process invocation. */
export interface ZshRunReq {
  readonly args: readonly string[]
  readonly env?: NodeJS.ProcessEnv
  readonly stdin?: string
}

/** Normalized zsh process result. */
export interface ZshRunResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number
  /** Symbolic spawn/OS error code (e.g. `"ENOENT"`, `"EACCES"`) when the process could not run. */
  readonly errCode?: string
}

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
] as const

const ZSH_ENV_KEEP_WIN32 = [
  "ComSpec",
  "COMSPEC",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "USERPROFILE",
] as const

const ZSH_ENV_DROP = ["BASH_ENV", "ENV", "FPATH", "ZDOTDIR"] as const

export function buildZshEnv(
  src: NodeJS.ProcessEnv,
  extra?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  const keys =
    process.platform === "win32"
      ? [...ZSH_ENV_KEEP, ...ZSH_ENV_KEEP_WIN32]
      : ZSH_ENV_KEEP
  for (const k of keys) {
    const v = src[k]
    if (v !== undefined) out[k] = v
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) out[k] = v
    }
  }
  for (const k of ZSH_ENV_DROP) delete out[k]
  return out
}

/**
 * Spawn the system zsh and normalize its result.
 *
 * SECURITY: no gating here — the only caller is the gate `runZsh` (zsh.ts),
 * which decides whether zsh may run at all.
 */
export function execZsh(
  zshBinary: string,
  { args, env, stdin }: ZshRunReq,
): Promise<ZshRunResult> {
  return new Promise(resolve => {
    const proc = execFile(
      zshBinary,
      args,
      {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        env: buildZshEnv(process.env, env),
      },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { status?: number }) | null
        resolve({
          stdout,
          stderr,
          code: e ? (e.status ?? 1) : 0,
          errCode: typeof e?.code === "string" ? e.code : undefined,
        })
      },
    )
    if (stdin !== undefined) proc.stdin?.end(stdin)
  })
}
