export const tokenTypes = ["function", "keyword"] as const
export const tokenModifiers = ["defaultLibrary"] as const
export type TokenType = (typeof tokenTypes)[number]
export type TokenModifier = (typeof tokenModifiers)[number]

type TokenSelector = TokenType | `${TokenType}.${TokenModifier}`

/** Fallback TextMate scopes, for themes that do not style semantic tokens. */
export const semanticTokenScopes: Partial<Record<TokenSelector, string[]>> = {
  "function.defaultLibrary": ["support.function.builtin.shell"],
}
