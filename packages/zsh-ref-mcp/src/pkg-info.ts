/**
 * Single source of truth for package identity strings.
 * In `.ts` (not read from `package.json` at runtime) since the JSR
 * surface has no `package.json`. `src/test/pkg-info.test.ts` enforces
 * sync with `package.json` and `deno.json`.
 */

export const PKG_NAME = "@carlwr/zsh-ref-mcp"
export const PKG_VERSION = "0.0.1"
export const PKG_REPO_URL = "https://github.com/carlwr/better-zsh"

/** Bare name; matches `package.json.bin` and the MCP `Server` name. */
export const MCP_BIN_NAME = "zsh-ref-mcp"
