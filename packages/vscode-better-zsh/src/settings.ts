import * as path from "node:path"
import * as vscode from "vscode"
import { BETTER_ZSH_CONFIG, mkZshBinary, type ZshBinary } from "./ids"
import {
  diagnosticsEnabledSetting,
  settingFullKey,
  zshPathSetting,
} from "./settings-metadata"

// ── Config keys (constructed from config section; only this module knows the suffixes) ──

const ZSH_PATH_KEY = settingFullKey(zshPathSetting)
const DIAGNOSTICS_ENABLED_KEY = settingFullKey(diagnosticsEnabledSetting)

/** For `affectsConfiguration` checks in wiring code. */
export { DIAGNOSTICS_ENABLED_KEY, ZSH_PATH_KEY }

// ── Setting constants (private to the parse boundary) ──

const ZSH_PATH_OFF = "off"
const ZSH_BINARY_DEFAULT = "zsh"

// ── Domain types ──

export type ZshPathConfig =
  | { kind: "disabled" }
  | { kind: "default"; binary: ZshBinary }
  | { kind: "explicit"; binary: ZshBinary }
  | { kind: "invalid"; raw: string; reason: "relative" }

// ── Smart constructor (exported for unit testing) ──

export function parseZshPath(raw: string): ZshPathConfig {
  if (raw === ZSH_PATH_OFF) return { kind: "disabled" }
  if (raw === "")
    return { kind: "default", binary: mkZshBinary(ZSH_BINARY_DEFAULT) }
  if (!path.isAbsolute(raw)) return { kind: "invalid", raw, reason: "relative" }
  return { kind: "explicit", binary: mkZshBinary(raw) }
}

// ── VS Code readers ──

function getConfig<T>(key: string, defaultVal: T): T {
  return vscode.workspace
    .getConfiguration(BETTER_ZSH_CONFIG)
    .get(key, defaultVal)
}

export function readZshPathConfig(): ZshPathConfig {
  return parseZshPath(
    getConfig<string>(zshPathSetting.suffix, zshPathSetting.default),
  )
}

export function readDiagnosticsEnabled(): boolean {
  return getConfig(
    diagnosticsEnabledSetting.suffix,
    diagnosticsEnabledSetting.default,
  )
}
