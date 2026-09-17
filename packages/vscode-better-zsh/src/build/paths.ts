import { join, resolve } from "node:path"

export const pkgDir = resolve(__dirname, "../..")
export const outDir = join(pkgDir, "out")
// Package-local: the staged root must not depend on enclosing-repo layout or
// ignore rules.
export const stagedExtensionDir = join(pkgDir, ".tmp", "staged-extension")
export const chatInstructionsMd = join(
  pkgDir,
  "src",
  "manifest",
  "chat-instructions.md",
)
