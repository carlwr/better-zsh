import { constants, existsSync } from "node:fs"
import { access } from "node:fs/promises"
import * as path from "node:path"
import { memoized } from "@carlwr/typescript-extra"
import {
  parseZshError,
  runZshVersion,
  ZSH_BASE_ARGS,
  ZSH_VERSION_ARGS,
  type ZshRunReq,
  type ZshRunResult,
  zshTokenize as zshTokenizeCore,
} from "zsh-core/exec"
import type { ZshBinary } from "./ids"
import { log, warn } from "./log"
import type { ZshPathConfig } from "./settings"
import { buildZshEnv, execZsh } from "./zsh-exec"

// ── Domain types ──

export type ZshMode =
  | { kind: "disabled" }
  | { kind: "invalid-config"; raw: string; reason: "relative" }
  | { kind: "available"; binary: ZshBinary }
  | { kind: "unavailable"; binary: ZshBinary; errCode: "ENOENT" | "EACCES" }

export type ZshCheckResult =
  | { ok: true }
  | { ok: false; line: number; msg: string }
  | { ok: "unavailable" }

// ── Pure logic ──

type ProbeResult =
  | { found: false }
  | { found: true; executable: boolean; path: ZshBinary }

export function deriveMode(binary: ZshBinary, probe: ProbeResult): ZshMode {
  if (!probe.found) return { kind: "unavailable", binary, errCode: "ENOENT" }
  if (!probe.executable)
    return { kind: "unavailable", binary: probe.path, errCode: "EACCES" }
  return { kind: "available", binary: probe.path }
}

// ── Filesystem probe (impure, isolated) ──

function resolveOnPath(
  binary: ZshBinary,
  env: NodeJS.ProcessEnv,
): ZshBinary | undefined {
  const pathVal = env.PATH
  if (!pathVal) return undefined
  const dirs = pathVal.split(path.delimiter).filter(Boolean)
  const exts =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""]
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, `${binary}${ext}`)
      if (existsSync(full)) return full as ZshBinary
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

async function probeZsh(
  config: ZshPathConfig & { kind: "default" | "explicit" },
  env: NodeJS.ProcessEnv,
): Promise<ProbeResult> {
  if (config.kind === "explicit") {
    if (!existsSync(config.binary as string)) return { found: false }
    const exec = await canExec(config.binary as string)
    return { found: true, executable: exec, path: config.binary }
  }
  const resolved = resolveOnPath(config.binary, env)
  if (!resolved) return { found: false }
  const exec = await canExec(resolved as string)
  return { found: true, executable: exec, path: resolved }
}

// ── Logging (side effects, contained in memoized thunks) ──

function logResolution(
  config: ZshPathConfig & { kind: "default" | "explicit" },
  mode: ZshMode,
) {
  if (config.kind === "explicit") {
    const suffix =
      mode.kind === "unavailable"
        ? mode.errCode === "EACCES"
          ? " (not executable)"
          : " (not found)"
        : ""
    log(`zsh: configured path ${config.binary}${suffix}`)
  } else {
    // PATH lookup
    const target =
      mode.kind === "available"
        ? `${mode.binary}`
        : mode.kind === "unavailable" && mode.errCode === "EACCES"
          ? `${mode.binary} (not executable)`
          : "unresolved"
    log(`zsh: PATH lookup for ${config.binary} -> ${target}`)
  }
  if (mode.kind === "unavailable") {
    const detail =
      config.kind === "explicit"
        ? `${mode.errCode === "EACCES" ? "not executable" : "not usable"} configured path: ${config.binary}`
        : `${mode.errCode ?? "spawn failed"}`
    warn(`zsh unavailable (${detail})`)
  }
}

function logInvalidConfig(config: ZshPathConfig & { kind: "invalid" }) {
  log(`zsh: invalid configured path ${config.raw} (relative path)`)
  warn(
    `zsh unavailable (invalid betterZsh.zshPath: relative paths are not allowed: ${config.raw})`,
  )
}

function logVersion(r: ZshRunResult) {
  if (r.code === 0) {
    const v = r.stdout.trim() || r.stderr.trim()
    if (v) log(`zsh version: ${v}`)
    return
  }
  warn(`failed to read zsh version (exit ${r.code})`)
}

// ── Module state: single memoized thunk ──

let getMode: () => Promise<ZshMode>

// Initialize to a sensible default (will be overwritten by configureZsh on activation)
getMode = memoized(async () => ({ kind: "disabled" }) as ZshMode)

export { buildZshEnv } from "./zsh-exec"

export function configureZsh(config: ZshPathConfig) {
  getMode = memoized(async () => {
    if (config.kind === "disabled") {
      log("zsh: disabled via betterZsh.zshPath=off")
      return { kind: "disabled" } as ZshMode
    }
    if (config.kind === "invalid") {
      logInvalidConfig(config)
      return {
        kind: "invalid-config",
        raw: config.raw,
        reason: config.reason,
      } as ZshMode
    }
    const probe = await probeZsh(config, buildZshEnv(process.env))
    const mode = deriveMode(config.binary, probe)
    logResolution(config, mode)
    if (mode.kind === "available") {
      // Fire-and-forget version check
      void runZshWithMode(mode, { args: [...ZSH_VERSION_ARGS] }).then((r) => {
        if (!r.errCode) logVersion(r)
      })
    }
    return mode
  })
}

// ── Result helpers ──

function unavailableResult(errCode = "ENOENT"): ZshRunResult {
  return { stdout: "", stderr: "", code: 1, errCode }
}

// ── Core runner ──

async function runZshWithMode(
  mode: ZshMode & { kind: "available" },
  req: ZshRunReq,
): Promise<ZshRunResult> {
  return execZsh(mode.binary as string, req)
}

async function runZsh(req: ZshRunReq): Promise<ZshRunResult> {
  const mode = await getMode()
  if (mode.kind === "disabled") return unavailableResult("DISABLED")
  if (mode.kind === "invalid-config") return unavailableResult("EINVAL")
  if (mode.kind === "unavailable") return unavailableResult(mode.errCode)

  const result = await runZshWithMode(mode, req)
  if (result.errCode === "ENOENT" || result.errCode === "EACCES") {
    // Binary disappeared after probe — invalidate
    const errCode = result.errCode as "ENOENT" | "EACCES"
    getMode = memoized(async () => ({
      kind: "unavailable" as const,
      binary: mode.binary,
      errCode,
    }))
    warn(`zsh became unavailable (${errCode}: ${mode.binary})`)
  }
  return result
}

// ── Public API ──

export async function zshAvailable(): Promise<boolean> {
  const r = await runZshVersion(runZsh)
  if (r.code === 0) return true
  if (!r.errCode) warn(`zsh unavailable (zsh --version exited ${r.code})`)
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

export async function zshTokenize(text: string): Promise<readonly string[]> {
  return (await zshTokenizeCore(runZsh, text)) ?? []
}
