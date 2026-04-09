import type { Brand } from "zsh-core"

export type { Brand }

type ZshLangId = Brand<string, "ZshLangId">
type ExtId = Brand<string, "ExtId">
type ConfigSection = Brand<string, "ConfigSection">
type DiagnosticSource = Brand<string, "DiagnosticSource">
type CommandId = Brand<string, "CommandId">
export type ZshBinary = Brand<string, "ZshBinary">

const mkZshLangId = (raw: string) => raw as ZshLangId
const mkExtId = (raw: string) => raw as ExtId
const mkConfigSection = (raw: string) => raw as ConfigSection
const mkDiagnosticSource = (raw: string) => raw as DiagnosticSource
const mkCommandId = (raw: string) => raw as CommandId
export const mkZshBinary = (raw: string) => raw as ZshBinary

export const ZSH_LANG_ID = mkZshLangId("zsh")
export const BETTER_ZSH_EXT_ID = mkExtId("carlwr.better-zsh")
export const BETTER_ZSH_CONFIG = mkConfigSection("betterZsh")
export const ZSH_DIAGNOSTIC_SOURCE = mkDiagnosticSource("zsh")
export const BETTER_ZSH_TEST_GET_LOGS = mkCommandId("betterZsh.__test.getLogs")
export const BETTER_ZSH_TEST_GET_SEMANTIC_TOKENS = mkCommandId(
  "betterZsh.__test.getSemanticTokens",
)
