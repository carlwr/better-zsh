import { cpSync, existsSync } from "node:fs"
import { join } from "node:path"

export const runtimeZshDataDir = "zsh-core-data"

export function resolveZshDataDir(baseDir = __dirname): string {
  const candidates = [
    join(baseDir, "data", "zsh-docs"),
    join(baseDir, "..", "src", "data", "zsh-docs"),
    join(baseDir, runtimeZshDataDir),
  ]
  const dir = candidates.find((cand) => existsSync(cand))
  if (dir) return dir
  throw new Error(`zsh docs dir not found: ${candidates.join(", ")}`)
}

export function copyRuntimeZshData(outDir: string, baseDir = __dirname) {
  cpSync(resolveZshDataDir(baseDir), join(outDir, runtimeZshDataDir), {
    recursive: true,
  })
}
