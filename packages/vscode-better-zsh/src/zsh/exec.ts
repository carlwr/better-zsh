import { type ExecFileException, execFile } from "node:child_process"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rm_rf } from "@carlwr/typescript-extra/node"
import type { ZshBinary } from "./binary"

/** Request shape for a single zsh process invocation. */
export interface ZshRunReq {
  readonly args: readonly string[]
  readonly env?: NodeJS.ProcessEnv
  readonly stdin?: string
  /** Written to a temporary file whose path is appended to `args`. */
  readonly scriptFile?: string
}

/** Normalized zsh process result. */
export interface ZshRunResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number
  /** Symbolic spawn/OS error code (e.g. `"ENOENT"`, `"EACCES"`, `"ETIMEDOUT"`) when the process could not run to completion. */
  readonly errCode?: string
}

const TIMEOUT_MS = 5000
const MAX_BUFFER = 1024 * 1024

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

/** Allowlisted `src` entries plus `extra`, minus startup-hook variables — even when `extra` names them. */
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
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v !== undefined) out[k] = v
  }
  for (const k of ZSH_ENV_DROP) delete out[k]
  return out
}

/**
 * Spawn the system zsh and normalize its result.
 *
 * SECURITY: no gating here — whether zsh may run at all is the single
 * caller's decision, made before any request reaches this module.
 */
export async function execZsh(
  zshBinary: ZshBinary,
  req: ZshRunReq,
): Promise<ZshRunResult> {
  if (req.scriptFile === undefined) return spawnZsh(zshBinary, req)
  const dir = await mkdtemp(join(tmpdir(), "better-zsh-"))
  try {
    const file = join(dir, "script.zsh")
    await writeFile(file, req.scriptFile)
    return await spawnZsh(zshBinary, { ...req, args: [...req.args, file] })
  } finally {
    await rm_rf(dir)
  }
}

function spawnZsh(
  zshBinary: ZshBinary,
  { args, env, stdin }: ZshRunReq,
): Promise<ZshRunResult> {
  return new Promise(resolve => {
    const proc = execFile(
      zshBinary,
      args,
      {
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: buildZshEnv(process.env, env),
      },
      (err, stdout, stderr) => resolve(toRunResult(err, stdout, stderr)),
    )
    if (stdin !== undefined) proc.stdin?.end(stdin)
  })
}

/** `err.code` is the exit code (number) or the spawn errno (string); a signal death leaves it null — `killed` marks the timeout kill. */
export function toRunResult(
  err: ExecFileException | null,
  stdout: string,
  stderr: string,
): ZshRunResult {
  const code = err?.code
  return {
    stdout,
    stderr,
    code: err ? (typeof code === "number" ? code : 1) : 0,
    errCode:
      typeof code === "string"
        ? code
        : err?.killed
          ? "ETIMEDOUT"
          : (err?.signal ?? undefined),
  }
}
