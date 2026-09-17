import { constants, existsSync } from "node:fs"
import { access } from "node:fs/promises"
import * as path from "node:path"
import { memoized } from "@carlwr/typescript-extra"
import { mkZshBinary, type ZshBinary } from "./ids"
import { log, warn } from "./log"
import { ZSH_PATH_OFF } from "./manifest"
import { ZSH_PATH_KEY, type ZshPathConfig } from "./settings"
import {
  buildZshEnv,
  execZsh,
  type ZshRunReq,
  type ZshRunResult,
} from "./zsh-exec"
import {
  parseZshError,
  splitLines,
  syntaxCheckReq,
  tokenizeReq,
  versionReq,
  type ZshError,
} from "./zsh-protocol"

// ── Domain types ──

type UnavailableCode = "ENOENT" | "EACCES"

type ZshMode =
  | { kind: "disabled" }
  | { kind: "invalid-config" }
  | { kind: "available"; binary: ZshBinary }
  | { kind: "unavailable"; binary: ZshBinary; errCode: UnavailableCode }

type ProbedMode = Extract<ZshMode, { kind: "available" | "unavailable" }>
type ZshPathUsable = Extract<ZshPathConfig, { kind: "default" | "explicit" }>

export type ZshCheckResult =
  | { kind: "ok" }
  | { kind: "unavailable" }
  | ({ kind: "error" } & ZshError)

// ── Filesystem probe (impure, isolated) ──

function resolveOnPath(
  binary: ZshBinary,
  env: NodeJS.ProcessEnv,
): ZshBinary | undefined {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean)
  const exts =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""]
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, `${binary}${ext}`)
      if (existsSync(full)) return mkZshBinary(full)
    }
  }
  return undefined
}

const canExec = (file: string) =>
  access(file, constants.X_OK).then(
    () => true,
    () => false,
  )

async function probeZsh(
  config: ZshPathUsable,
  env: NodeJS.ProcessEnv,
): Promise<ProbedMode> {
  const file =
    config.kind === "explicit"
      ? existsSync(config.binary)
        ? config.binary
        : undefined
      : resolveOnPath(config.binary, env)
  if (!file)
    return { kind: "unavailable", binary: config.binary, errCode: "ENOENT" }
  if (!(await canExec(file)))
    return { kind: "unavailable", binary: file, errCode: "EACCES" }
  return { kind: "available", binary: file }
}

// ── Logging ──

function logResolution(config: ZshPathUsable, mode: ProbedMode) {
  const { binary } = config
  if (mode.kind === "available") {
    log(
      config.kind === "explicit"
        ? `zsh: configured path ${binary}`
        : `zsh: PATH lookup for ${binary} -> ${mode.binary}`,
    )
    return
  }
  const notExec = mode.errCode === "EACCES"
  if (config.kind === "explicit") {
    log(
      `zsh: configured path ${binary}${notExec ? " (not executable)" : " (not found)"}`,
    )
    warn(
      `zsh unavailable (${notExec ? "not executable" : "not usable"} configured path: ${binary})`,
    )
  } else {
    log(
      `zsh: PATH lookup for ${binary} -> ${notExec ? `${mode.binary} (not executable)` : "unresolved"}`,
    )
    warn(`zsh unavailable (${mode.errCode})`)
  }
}

function logVersion(r: ZshRunResult) {
  if (r.errCode) return
  if (r.code !== 0) return warn(`failed to read zsh version (exit ${r.code})`)
  const v = r.stdout.trim() || r.stderr.trim()
  if (v) log(`zsh version: ${v}`)
}

// ── Mode: resolved once per configuration ──

async function resolveMode(config: ZshPathConfig): Promise<ZshMode> {
  switch (config.kind) {
    case "disabled":
      log(`zsh: disabled via ${ZSH_PATH_KEY}=${ZSH_PATH_OFF}`)
      return { kind: "disabled" }
    case "invalid":
      log(`zsh: invalid configured path ${config.raw} (${config.reason})`)
      warn(
        `zsh unavailable (invalid ${ZSH_PATH_KEY}: ${config.reason}: ${config.raw})`,
      )
      return { kind: "invalid-config" }
    default: {
      const mode = await probeZsh(config, buildZshEnv(process.env))
      logResolution(config, mode)
      if (mode.kind === "available") void runZsh(versionReq).then(logVersion)
      return mode
    }
  }
}

// Disabled until `configureZsh` runs.
let getMode: () => Promise<ZshMode> = memoized<ZshMode>(async () => ({
  kind: "disabled",
}))

export function configureZsh(config: ZshPathConfig) {
  getMode = memoized(() => resolveMode(config))
}

// ── The single gate for executing the system zsh ──
//
// SECURITY: every editor feature reaches the binary through here, and only the
// `available` mode spawns — disabled/invalid/unavailable modes short-circuit
// before `execZsh`.

const unavailable = (errCode: string): ZshRunResult => ({
  stdout: "",
  stderr: "",
  code: 1,
  errCode,
})

async function runZsh(req: ZshRunReq): Promise<ZshRunResult> {
  const thunk = getMode
  const mode = await thunk()
  if (mode.kind === "disabled") return unavailable("DISABLED")
  if (mode.kind === "invalid-config") return unavailable("EINVAL")
  if (mode.kind === "unavailable") return unavailable(mode.errCode)

  const result = await execZsh(mode.binary, req)
  const { errCode } = result
  if (!errCode) return result
  if ((errCode === "ENOENT" || errCode === "EACCES") && getMode === thunk) {
    // Binary disappeared after the probe: pin the mode until reconfigured.
    getMode = memoized<ZshMode>(async () => ({
      kind: "unavailable",
      binary: mode.binary,
      errCode,
    }))
    warn(`zsh became unavailable (${errCode}: ${mode.binary})`)
  } else warn(`zsh run failed (${errCode}: ${mode.binary})`)
  return result
}

// ── Public API ──

export async function zshCheck(text: string): Promise<ZshCheckResult> {
  const r = await runZsh(syntaxCheckReq(text))
  if (r.errCode) return { kind: "unavailable" }
  if (r.code === 0) return { kind: "ok" }
  const err = parseZshError(r.stderr)
  if (!err) warn(`zsh -n: exit ${r.code} without a message`)
  return { kind: "error", ...(err ?? { line: 1, msg: "syntax error" }) }
}

export async function zshTokenize(text: string): Promise<readonly string[]> {
  const r = await runZsh(tokenizeReq(text))
  return r.code === 0 ? splitLines(r.stdout) : []
}
