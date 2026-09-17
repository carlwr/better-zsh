import type { Brand } from "@carlwr/zsh-core/types"

const id = <B extends string>(raw: string) => raw as Brand<string, B>

export const BETTER_ZSH_DISPLAY_NAME = "Better Zsh"
export const ZSH_LANG_ID = id<"LangId">("zsh")
export const BETTER_ZSH_CONFIG = id<"ConfigSection">("betterZsh")
export const ZSH_DIAGNOSTIC_SOURCE = id<"DiagnosticSource">("zsh")
export const BETTER_ZSH_TEST_GET_LOGS = id<"CommandId">(
  "betterZsh.__test.getLogs",
)
