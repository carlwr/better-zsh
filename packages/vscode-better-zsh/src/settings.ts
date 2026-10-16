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
    return {
      kind: "invalid",
      raw: String(JSON.stringify(raw)),
      reason: "not a string",
    }
  if (raw === ZSH_PATH_OFF) return { kind: "disabled" }
  if (raw === "")
    return { kind: "default", binary: mkZshBinary(ZSH_BINARY_DEFAULT) }
  if (!path.isAbsolute(raw))
    return { kind: "invalid", raw, reason: "relative path" }
  return { kind: "explicit", binary: mkZshBinary(raw) }
}

/** The raw setting value; `null`/unset read as the default. `scope`: a resource-scoped setting's document. */
const readSetting = (setting: Setting, scope?: vscode.Uri): unknown =>
  vscode.workspace.getConfiguration(undefined, scope).get(setting.key) ??
  setting.default

export const readZshPathConfig = () =>
  parseZshPath(readSetting(settings.zshPath))

/** Host-zsh configuration: the path setting, unless the workspace is untrusted. */
export type ZshConfig = ZshPathConfig | { kind: "untrusted" }

// Workspace Trust gates every spawn, not only the workspace-scoped settings:
// in Restricted Mode the files are the untrusted input.
export const readZshConfig = (): ZshConfig =>
  vscode.workspace.isTrusted ? readZshPathConfig() : { kind: "untrusted" }

export const readDiagnosticsEnabled = (doc: vscode.Uri) =>
  readSetting(settings.diagnosticsEnabled, doc) !== false

/** Runs `listener` whenever `setting` changes, in any configuration scope. */
export const onDidChangeSetting = (setting: Setting, listener: () => void) =>
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration(setting.key)) listener()
  })
