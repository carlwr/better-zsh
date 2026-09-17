import * as path from "node:path"
import * as vscode from "vscode"
import { type Setting, settings, ZSH_PATH_OFF } from "./manifest/settings"
import { mkZshBinary, type ZshBinaryRef } from "./zsh/binary"

const ZSH_BINARY_DEFAULT = "zsh"

export type ZshPathConfig =
  | { kind: "disabled" }
  | ZshBinaryRef
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
const readSetting = (setting: Setting): unknown =>
  vscode.workspace.getConfiguration().get(setting.key) ?? setting.default

export const readZshPathConfig = () =>
  parseZshPath(readSetting(settings.zshPath))

export const readDiagnosticsEnabled = () =>
  readSetting(settings.diagnosticsEnabled) !== false

/** Runs `listener` whenever `setting` changes, in any configuration scope. */
export const onDidChangeSetting = (setting: Setting, listener: () => void) =>
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration(setting.key)) listener()
  })
