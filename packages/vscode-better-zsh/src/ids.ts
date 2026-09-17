type Brand<T, B extends string> = T & { readonly __brand: B }

const brand = <B extends string>(raw: string) => raw as Brand<string, B>

export type ZshBinary = Brand<string, "ZshBinary">
export const mkZshBinary = (raw: string) => brand<"ZshBinary">(raw)

export const BETTER_ZSH_DISPLAY_NAME = "Better Zsh"
export const ZSH_LANG_ID = brand<"LangId">("zsh")
export const BETTER_ZSH_EXT_ID = brand<"ExtId">("carlwr.better-zsh")
export const BETTER_ZSH_CONFIG = brand<"ConfigSection">("betterZsh")
export const ZSH_DIAGNOSTIC_SOURCE = brand<"DiagnosticSource">("zsh")
export const BETTER_ZSH_TEST_GET_LOGS = brand<"CommandId">(
  "betterZsh.__test.getLogs",
)
export const BETTER_ZSH_TEST_GET_SEMANTIC_TOKENS = brand<"CommandId">(
  "betterZsh.__test.getSemanticTokens",
)
