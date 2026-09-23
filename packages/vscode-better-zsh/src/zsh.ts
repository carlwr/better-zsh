import { assertNever, memoized } from "@carlwr/typescript-extra"
import { debug, log, warn } from "./log"
import { settings, ZSH_PATH_OFF } from "./manifest/settings"
import type { ZshConfig } from "./settings"
import { probeZsh, type ZshBinaryRef, type ZshProbe } from "./zsh/binary"
import {
  buildZshEnv,
  execZsh,
  type ZshRunReq,
  type ZshRunResult,
} from "./zsh/exec"
import { parseZshError, syntaxCheckReq, type ZshError } from "./zsh/protocol"

type ZshMode =
  | { kind: "disabled" }
  | { kind: "invalid-config" }
  | { kind: "untrusted" }
  | ZshProbe

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

// ── Mode: resolved once per configuration ──

async function resolveMode(config: ZshConfig): Promise<ZshMode> {
  const { key } = settings.zshPath
  switch (config.kind) {
    case "disabled":
      log(`zsh: disabled via ${key}=${ZSH_PATH_OFF}`)
      return { kind: "disabled" }
    case "untrusted":
      log("zsh: workspace not trusted; host zsh off until trust is granted")
      return { kind: "untrusted" }
    case "invalid":
      log(`zsh: invalid configured path ${config.raw} (${config.reason})`)
      warn(`zsh unavailable (invalid ${key}: ${config.reason}: ${config.raw})`)
      return { kind: "invalid-config" }
    default: {
      const mode = await probeZsh(config, buildZshEnv(process.env))
      logProbe(config, mode)
      return mode
    }
  }
}

// Disabled until `configureZsh` runs.
let getMode: () => Promise<ZshMode> = memoized<ZshMode>(async () => ({
  kind: "disabled",
}))

export function configureZsh(config: ZshConfig) {
  getMode = memoized(() => resolveMode(config))
}

// ── The single gate for executing the system zsh ──
//
// SECURITY: every editor feature reaches the binary through here, and only the
// `available` mode spawns — disabled/invalid/untrusted/unavailable modes
// short-circuit before `execZsh`.

const unavailable = (errCode: string): ZshRunResult => ({
  stdout: "",
  stderr: "",
  code: 1,
  errCode,
})

// Exhaustive: a new mode fails to compile until it is refused here.
function blockedCode(mode: Exclude<ZshMode, { kind: "available" }>): string {
  switch (mode.kind) {
    case "disabled":
      return "DISABLED"
    case "invalid-config":
      return "EINVAL"
    case "untrusted":
      return "UNTRUSTED"
    case "unavailable":
      return mode.errCode
    default:
      return assertNever(mode)
  }
}

async function runZsh(req: ZshRunReq): Promise<ZshRunResult> {
  const thunk = getMode
  const mode = await thunk()
  if (mode.kind !== "available") return unavailable(blockedCode(mode))

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

// ── Public API: the one thing the host zsh is asked to do ──

export async function zshCheck(text: string): Promise<ZshCheckResult> {
  const r = await runZsh(syntaxCheckReq(text))
  if (r.errCode) return { kind: "unavailable" }
  if (r.code === 0) {
    debug("zsh -n: ok")
    return { kind: "ok" }
  }
  const err = parseZshError(r.stderr)
  if (!err) warn(`zsh -n: exit ${r.code} without a message`)
  const error = err ?? { line: 1, msg: "syntax error" }
  debug(`zsh -n: error at line ${error.line}`)
  return { kind: "error", ...error }
}
