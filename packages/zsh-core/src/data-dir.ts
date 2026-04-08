import { cpSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here: string =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))

/** Conventional directory name for Yodl data copied into a consumer's output. */
export const runtimeZshDataDir = "zsh-core-data"

/** Locate the vendored Yodl data directory, trying dev/built/runtime candidate paths. */
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

/** Copy the vendored Yodl sources into a consumer's output directory, enabling the programmatic API at runtime. */
export function copyRuntimeZshData(outDir: string, baseDir = here) {
  cpSync(resolveZshDataDir(baseDir), join(outDir, runtimeZshDataDir), {
    recursive: true,
  })
}
