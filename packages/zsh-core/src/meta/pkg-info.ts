/**
 * Single source of truth for package identity strings.
 * In `.ts` (not read from `package.json` at runtime): constants survive
 * bundling and need no file system. `src/test/pkg-info.test.ts` enforces
 * sync with `package.json`.
 */

/** Scoped npm package name. */
export const PKG_NAME = "@carlwr/zsh-core"
export const PKG_VERSION = "0.1.0-alpha.2"
export const PKG_REPO_URL = "https://github.com/carlwr/better-zsh"
export const PKG_LICENSE = "MIT"
