import { cpSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here: string =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))

export const runtimeZshDataDir = "zsh-core-data"

/** Resolve the packaged/raw zsh-doc data directory relative to a module base dir. */
export function resolveZshDataDir(baseDir = here): string {
  const candidates = [
    join(baseDir, "data", "zsh-docs"),
    join(baseDir, "..", "src", "data", "zsh-docs"),
    join(baseDir, runtimeZshDataDir),
  ]
  const dir = candidates.find((cand) => existsSync(cand))
  if (dir) return dir
  throw new Error(`zsh docs dir not found: ${candidates.join(", ")}`)
}

/** Copy the runtime zsh-doc payload into another output directory. */
export function copyRuntimeZshData(outDir: string, baseDir = here) {
  cpSync(resolveZshDataDir(baseDir), join(outDir, runtimeZshDataDir), {
    recursive: true,
  })
}
