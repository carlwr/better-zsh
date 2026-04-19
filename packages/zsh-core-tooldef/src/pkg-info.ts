/**
 * Single source of truth for package identity strings.
 * In `.ts` (not read from `package.json` at runtime) since the JSR
 * surface has no `package.json`. `src/test/pkg-info.test.ts` enforces
 * sync with `package.json` and `deno.json`.
 */

export const PKG_NAME = "@carlwr/zsh-core-tooldef"
export const PKG_VERSION = "0.1.0-alpha.0"
export const PKG_REPO_URL = "https://github.com/carlwr/better-zsh"
