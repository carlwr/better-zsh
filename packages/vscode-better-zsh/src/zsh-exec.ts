import { execFile } from "node:child_process"
import type { ZshRunner, ZshRunReq, ZshRunResult } from "zsh-core/exec"

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

export function makeExecZshRunner(zshBinary: string): ZshRunner {
  return req => execZsh(zshBinary, req)
}
