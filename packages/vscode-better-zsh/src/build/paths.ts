import { join, resolve } from "node:path"

export const pkgDir = resolve(__dirname, "../..")
export const outDir = join(pkgDir, "out")
export const stagedExtensionDir = join(
  pkgDir,
  "../..",
  ".non-vcs",
  "vscode-better-zsh-extension",
)
const zshAssetsDir = join(pkgDir, "src", "assets", "zsh")

export const snippetsPath = join(zshAssetsDir, "snippets.jsonc")
export const bashDiffsPath = join(zshAssetsDir, "bash-differences.md")
