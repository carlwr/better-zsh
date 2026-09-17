import { memoized } from "@carlwr/typescript-extra"
import { log, warn } from "./log"
import { settings, ZSH_PATH_OFF } from "./manifest/settings"
import type { ZshPathConfig } from "./settings"
import { probeZsh, type ZshBinaryRef, type ZshProbe } from "./zsh/binary"
import {
  buildZshEnv,
  execZsh,
  type ZshRunReq,
  type ZshRunResult,
} from "./zsh/exec"
import {
  parseZshError,
  splitLines,
  syntaxCheckReq,
  tokenizeReq,
  versionReq,
  type ZshError,
} from "./zsh/protocol"

type ZshMode = { kind: "disabled" } | { kind: "invalid-config" } | ZshProbe

export type ZshCheckResult =
  | { kind: "ok" }
  | { kind: "unavailable" }
  | ({ kind: "error" } & ZshError)

// ── Logging ──

const probeStatus = (probe: ZshProbe) =>
  probe.kind === "available"
    ? ""
    : probe.errCode === "EACCES"
      ? " (not executable)"
      : " (not found)"

function logProbe(ref: ZshBinaryRef, probe: ZshProbe) {
  const status = probeStatus(probe)
  const onPath =
    probe.kind === "unavailable" && probe.errCode === "ENOENT"
      ? "unresolved"
      : `${probe.binary}${status}`
  log(
    ref.kind === "explicit"
      ? `zsh: configured path ${ref.binary}${status}`
      : `zsh: PATH lookup for ${ref.binary} -> ${onPath}`,
  )
  if (probe.kind === "unavailable")
    warn(`zsh unavailable (${probe.errCode}: ${probe.binary})`)
}

function logVersion(r: ZshRunResult) {
  if (r.errCode) return
  if (r.code !== 0) return warn(`failed to read zsh version (exit ${r.code})`)
  const v = r.stdout.trim() || r.stderr.trim()
  if (v) log(`zsh version: ${v}`)
}

// ── Mode: resolved once per configuration ──

async function resolveMode(config: ZshPathConfig): Promise<ZshMode> {
  const { key } = settings.zshPath
  switch (config.kind) {
    case "disabled":
      log(`zsh: disabled via ${key}=${ZSH_PATH_OFF}`)
      return { kind: "disabled" }
    case "invalid":
      log(`zsh: invalid configured path ${config.raw} (${config.reason})`)
      warn(`zsh unavailable (invalid ${key}: ${config.reason}: ${config.raw})`)
      return { kind: "invalid-config" }
    default: {
      const mode = await probeZsh(config, buildZshEnv(process.env))
      logProbe(config, mode)
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
