export type Brand<T, B extends string> = T & { readonly __brand: B }

type ZshLangId = Brand<string, "ZshLangId">
type ExtId = Brand<string, "ExtId">
type ConfigSection = Brand<string, "ConfigSection">
type ConfigKey = Brand<string, "ConfigKey">
type DiagnosticSource = Brand<string, "DiagnosticSource">
type ZshPathSetting = Brand<string, "ZshPathSetting">

const mkZshLangId = (raw: string) => raw as ZshLangId
const mkExtId = (raw: string) => raw as ExtId
const mkConfigSection = (raw: string) => raw as ConfigSection
const mkConfigKey = (raw: string) => raw as ConfigKey
const mkDiagnosticSource = (raw: string) => raw as DiagnosticSource
const mkZshPathSetting = (raw: string) => raw as ZshPathSetting

export const ZSH_LANG_ID = mkZshLangId("zsh")
export const BETTER_ZSH_EXT_ID = mkExtId("carlwr.better-zsh")
export const BETTER_ZSH_CONFIG = mkConfigSection("betterZsh")
export const BETTER_ZSH_ZSH_PATH = mkConfigKey("betterZsh.zshPath")
export const BETTER_ZSH_DIAGNOSTICS_ENABLED = mkConfigKey(
  "betterZsh.diagnostics.enabled",
)
export const ZSH_DIAGNOSTIC_SOURCE = mkDiagnosticSource("zsh")
export const ZSH_BINARY_DEFAULT = mkZshPathSetting("zsh")
export const ZSH_PATH_OFF = mkZshPathSetting("off")
