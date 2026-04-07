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
  zshBuiltins as zshBuiltinsCore,
  zshOptions as zshOptionsCore,
  zshParameters as zshParametersCore,
  zshReswords as zshReswordsCore,
  zshTokenize as zshTokenizeCore,
} from "zsh-core/exec"
import { log, warn } from "./log"
import { buildZshEnv, execZsh } from "./zsh-exec"

let zshBinary = "zsh"
let zshDisabled = false

/** Update zsh binary path from settings. Call on activation and config change. */
export function setZshPath(setting: string) {
  if (setting === "off") {
    zshDisabled = true
    zshBinary = "zsh" // unused when disabled
  } else {
    zshDisabled = false
    zshBinary = setting || "zsh"
  }
}

export function isZshDisabled() {
  return zshDisabled
}

let zshInfoLogged = false

export { buildZshEnv } from "./zsh-exec"

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

function maybeLogZshInfo(
  env: NodeJS.ProcessEnv | undefined,
  args: string[],
  result?: ZshRunResult,
) {
  if (zshInfoLogged) return
  zshInfoLogged = true
  const zshEnv = buildZshEnv(process.env, env)
  const resolved = resolveZshPath(zshEnv)
  if (resolved) {
    void canExec(resolved).then((ok) =>
      log(`zsh path: ${resolved}${ok ? "" : " (not executable)"}`),
    )
  } else {
    log("zsh path: unresolved (using PATH lookup)")
  }
  if (args.length === 1 && args[0] === "--version" && result) {
    logZshVersion(result)
    return
  }
  void execZsh(zshBinary, { args: [...ZSH_VERSION_ARGS] }).then(logZshVersion)
}

function runZsh(req: ZshRunReq) {
  return execZshLogged(req).then((r) => {
    maybeLogZshInfo(req.env, req.args, r)
    return r
  })
}

export async function zshAvailable(): Promise<boolean> {
  if (zshDisabled) {
    log("zsh invocation disabled")
    return false
  }
  const r = await runZshVersion(runZsh)
  const ok = r.code === 0
  if (!ok) warn("zsh not found on PATH; zsh-dependent features disabled")
  return ok
}

export async function zshCheck(
  text: string,
): Promise<{ ok: true } | { ok: false; line: number; msg: string }> {
  const r = await runZsh({ args: [...ZSH_BASE_ARGS, "-n"], stdin: text })
  if (r.code === 0) return { ok: true }
  const parsed = parseZshError(r.stderr)
  if (parsed) return { ok: false, ...parsed }
  warn("zsh -n: unexpected stderr format")
  return { ok: false, line: 1, msg: "syntax error" }
}

export async function zshTokenize(text: string): Promise<string[]> {
  return (await zshTokenizeCore(runZsh, text)) ?? []
}

export async function zshBuiltins(): Promise<string[]> {
  const out = await zshBuiltinsCore(runZsh)
  if (!out) {
    warn("failed to query zsh builtins")
    return []
  }
  return out
}

export async function zshReswords(): Promise<string[]> {
  const out = await zshReswordsCore(runZsh)
  if (!out) {
    warn("failed to query zsh reswords")
    return []
  }
  return out
}

export async function zshOptions(): Promise<string[]> {
  const out = await zshOptionsCore(runZsh)
  if (!out) {
    warn("failed to query zsh options")
    return []
  }
  return out
}

export async function zshParameters(): Promise<Map<string, string>> {
  const out = await zshParametersCore(runZsh)
  if (!out) {
    warn("failed to query zsh parameters")
    return new Map()
  }
  return out
}
