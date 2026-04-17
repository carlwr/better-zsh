import { cpSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Directory containing this module file — resolved for CJS (__dirname) and ESM (import.meta.url).
const thisDir: string =
  typeof __dirname !== "undefined"
    ? resolve(__dirname)
    : dirname(fileURLToPath(import.meta.url))

/** Conventional directory name for Yodl data copied into a consumer's output. */
export const runtimeZshDataDir = "zsh-core-data"

/** Vendored zsh Yodl payload required by runtime loaders and packaging checks. */
export const vendoredZshDocFiles = [
  "SOURCE.md",
  "builtins.yo",
  "cond.yo",
  "expn.yo",
  "grammar.yo",
  "options.yo",
  "params.yo",
  "prompt.yo",
  "redirect.yo",
  "zle.yo",
] as const

// Three candidate layouts:
//   dev:     <thisDir>/data/zsh-docs         (source tree, running from src/)
//   built:   <thisDir>/../src/data/zsh-docs  (dist/, pointing back to src/)
//   runtime: <thisDir>/zsh-core-data         (consumer copied via copyRuntimeZshData)
/** Locate the vendored Yodl data directory, trying dev/built/runtime candidate paths. */
export function resolveZshDataDir(baseDir = thisDir): string {
  const candidates = [
    join(baseDir, "data", "zsh-docs"),
    join(baseDir, "..", "src", "data", "zsh-docs"),
    join(baseDir, runtimeZshDataDir),
  ]
  const dir = firstExisting(candidates)
  if (dir) return dir
  throw new Error(`zsh docs dir not found: ${candidates.join(", ")}`)
}

/** Copy the vendored Yodl sources into a consumer's output directory, enabling the programmatic API at runtime. */
export function copyRuntimeZshData(outDir: string, baseDir = thisDir) {
  cpSync(resolveZshDataDir(baseDir), join(outDir, runtimeZshDataDir), {
    recursive: true,
  })
}

function firstExisting(candidates: readonly string[]): string | undefined {
  return candidates.find(cand => existsSync(cand))
}
