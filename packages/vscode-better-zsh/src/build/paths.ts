import { join, resolve } from "node:path"

export const pkgDir = resolve(__dirname, "../..")
export const outDir = join(pkgDir, "out")
// Package-local: the staged root must not depend on enclosing-repo layout or
// ignore rules.
export const stagedExtensionDir = join(pkgDir, ".tmp", "staged-extension")
const zshAssetsDir = join(pkgDir, "src", "assets", "zsh")

export const snippetsPath = join(zshAssetsDir, "snippets.jsonc")
export const bashDiffsPath = join(zshAssetsDir, "bash-differences.md")
