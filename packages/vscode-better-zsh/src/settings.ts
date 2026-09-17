import * as path from "node:path"
import * as vscode from "vscode"
import { BETTER_ZSH_CONFIG, mkZshBinary, type ZshBinary } from "./ids"
import {
  diagnosticsEnabledSetting,
  settingKey,
  ZSH_PATH_OFF,
  zshPathSetting,
} from "./manifest"

/** For `affectsConfiguration` checks. */
export const ZSH_PATH_KEY = settingKey(zshPathSetting)
export const DIAGNOSTICS_ENABLED_KEY = settingKey(diagnosticsEnabledSetting)

const ZSH_BINARY_DEFAULT = "zsh"

export type ZshPathConfig =
  | { kind: "disabled" }
  | { kind: "default"; binary: ZshBinary }
  | { kind: "explicit"; binary: ZshBinary }
  | { kind: "invalid"; raw: string; reason: "relative path" | "not a string" }

/** The settings boundary: relative paths are rejected, never resolved; settings JSON may hold any type. */
export function parseZshPath(raw: unknown): ZshPathConfig {
  if (typeof raw !== "string")
    return { kind: "invalid", raw: String(raw), reason: "not a string" }
  if (raw === ZSH_PATH_OFF) return { kind: "disabled" }
  if (raw === "")
    return { kind: "default", binary: mkZshBinary(ZSH_BINARY_DEFAULT) }
  if (!path.isAbsolute(raw))
    return { kind: "invalid", raw, reason: "relative path" }
  return { kind: "explicit", binary: mkZshBinary(raw) }
}

/** The raw setting value; `null`/unset read as the default. */
function readSetting(setting: { suffix: string; default: unknown }): unknown {
  return (
    vscode.workspace.getConfiguration(BETTER_ZSH_CONFIG).get(setting.suffix) ??
    setting.default
  )
}

export const readZshPathConfig = () => parseZshPath(readSetting(zshPathSetting))

export const readDiagnosticsEnabled = () =>
  readSetting(diagnosticsEnabledSetting) !== false
