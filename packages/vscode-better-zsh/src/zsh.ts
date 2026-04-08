import { constants, existsSync } from "node:fs"
import { access } from "node:fs/promises"
import * as path from "node:path"
import {
  parseZshError,
  runZshVersion,
  ZSH_BASE_ARGS,
  ZSH_VERSION_ARGS,
  type ZshRunReq,
  type ZshRunResult,
  zshTokenize as zshTokenizeCore,
} from "zsh-core/exec"
import { ZSH_BINARY_DEFAULT, ZSH_PATH_OFF } from "./ids"
import { log, warn } from "./log"
import { buildZshEnv, execZsh } from "./zsh-exec"

let zshBinary: string = ZSH_BINARY_DEFAULT
let zshSetting = ""
let zshDisabled = false
let zshInfoLogged = false
let zshVersionLogged = false
let zshWarnedUnavailable = false
let zshUnavailableErrCode: string | undefined

export type ZshCheckResult =
  | { ok: true }
  | { ok: false; line: number; msg: string }
  | { ok: "unavailable" }

/** Update zsh binary path from settings. Call on activation and config change. */
export function setZshPath(setting: string) {
  zshSetting = setting
  if (setting === ZSH_PATH_OFF) {
    zshDisabled = true
    zshBinary = ZSH_BINARY_DEFAULT // unused when disabled
  } else {
    zshDisabled = false
    zshBinary = setting || ZSH_BINARY_DEFAULT
  }
  zshInfoLogged = false
  zshVersionLogged = false
  zshWarnedUnavailable = false
  zshUnavailableErrCode = undefined
}

export function isZshDisabled() {
  return zshDisabled
}

export { buildZshEnv } from "./zsh-exec"

function hasExplicitZshPath() {
  return !zshDisabled && zshSetting !== ""
}

function unavailableResult(errCode = "ENOENT"): ZshRunResult {
  return { stdout: "", stderr: "", code: 1, errCode }
}

function disabledResult(): ZshRunResult {
  return unavailableResult("DISABLED")
}

function execZshLogged(req: ZshRunReq) {
  // Keep all zsh process spawning centralized so the environment contract is
  // easy to inspect in one place; that is safer and more transparent than
  // scattering ad-hoc exec calls across features.
  return execZsh(zshBinary, req)
}

function resolveZshPath(env: NodeJS.ProcessEnv): string | undefined {
  const pathValue = env.PATH
  if (!pathValue) return undefined
  const dirs = pathValue.split(path.delimiter).filter(Boolean)
  const exts =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""]
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, `${zshBinary}${ext}`)
      if (existsSync(full)) return full
    }
  }
  return undefined
}

async function canExec(file: string) {
  try {
    await access(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function logZshVersion(r: ZshRunResult) {
  if (r.code === 0) {
    const version = r.stdout.trim() || r.stderr.trim()
    if (version) log(`zsh version: ${version}`)
    return
  }
  warn(`failed to read zsh version (exit ${r.code})`)
}

async function maybeLogZshInfo(env: NodeJS.ProcessEnv | undefined) {
  if (zshInfoLogged) return
  zshInfoLogged = true

  // Log the resolved execution mode the first time we actually need zsh; for
  // bug reports this is usually more actionable than the version string alone.
  if (zshDisabled) {
    log("zsh: disabled via betterZsh.zshPath=off")
    return
  }

  const zshEnv = buildZshEnv(process.env, env)
  if (hasExplicitZshPath()) {
    if (!existsSync(zshBinary)) {
      log(`zsh: configured path ${zshBinary} (not found)`)
      return
    }
    log(
      `zsh: configured path ${zshBinary}${(await canExec(zshBinary)) ? "" : " (not executable)"}`,
    )
    return
  }

  const resolved = resolveZshPath(zshEnv)
  if (!resolved) {
    log(`zsh: PATH lookup for ${zshBinary} -> unresolved`)
    return
  }
  log(
    `zsh: PATH lookup for ${zshBinary} -> ${resolved}${(await canExec(resolved)) ? "" : " (not executable)"}`,
  )
}

function maybeWarnUnavailable(result: ZshRunResult) {
  if (zshWarnedUnavailable || result.errCode === "DISABLED") return
  zshWarnedUnavailable = true
  if (hasExplicitZshPath()) {
    const detail = result.errCode === "EACCES" ? "not executable" : "not usable"
    warn(`zsh unavailable (${detail} configured path: ${zshBinary})`)
    return
  }
  warn(`zsh unavailable via PATH lookup (${result.errCode ?? "spawn failed"})`)
}

function maybeLogVersion(args: string[], result: ZshRunResult) {
  if (zshVersionLogged || result.errCode) return
  zshVersionLogged = true
  if (args.length === 1 && args[0] === "--version") {
    logZshVersion(result)
    return
  }
  void execZsh(zshBinary, { args: [...ZSH_VERSION_ARGS] }).then((r) => {
    if (!r.errCode) logZshVersion(r)
  })
}

async function runZsh(req: ZshRunReq): Promise<ZshRunResult> {
  await maybeLogZshInfo(req.env)
  if (zshDisabled) return disabledResult()
  if (zshUnavailableErrCode) return unavailableResult(zshUnavailableErrCode)

  const result = await execZshLogged(req)
  if (result.errCode === "ENOENT" || result.errCode === "EACCES") {
    zshUnavailableErrCode = result.errCode
    maybeWarnUnavailable(result)
    return result
  }
  maybeLogVersion(req.args, result)
  return result
}

export async function zshAvailable(): Promise<boolean> {
  const r = await runZshVersion(runZsh)
  if (r.code === 0) return true
  if (!r.errCode && !zshWarnedUnavailable) {
    zshWarnedUnavailable = true
    warn(`zsh unavailable (zsh --version exited ${r.code})`)
  }
  return false
}

export async function zshCheck(text: string): Promise<ZshCheckResult> {
  const r = await runZsh({ args: [...ZSH_BASE_ARGS, "-n"], stdin: text })
  if (r.errCode) return { ok: "unavailable" }
  if (r.code === 0) return { ok: true }
  const parsed = parseZshError(r.stderr)
  if (parsed) return { ok: false, ...parsed }
  warn("zsh -n: unexpected stderr format")
  return { ok: false, line: 1, msg: "syntax error" }
}

export async function zshTokenize(text: string): Promise<string[]> {
  return (await zshTokenizeCore(runZsh, text)) ?? []
}
