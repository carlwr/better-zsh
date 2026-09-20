import { cpSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { corpusYodlFiles } from "../docs/source-files.ts"

// Dual CJS/ESM resolution for the module's own directory.
const thisDir: string =
  typeof __dirname !== "undefined"
    ? resolve(__dirname)
    : dirname(fileURLToPath(import.meta.url))

/** The one directory name the runtime lookup accepts beside the module. */
export const runtimeZshDataDir = "zsh-core-data"

/**
 * The vendored data set: what the source tree holds, what `build` copies to
 * `dist/`, what `copyRuntimeZshData` copies on. Pinned against the source
 * tree by `zsh-data-assets.test.ts`.
 */
export const vendoredZshDocFiles = [
  "SOURCE.md",
  "THIRD_PARTY_NOTICES.md",
  ...corpusYodlFiles,
] as const

/**
 * Every path `copyRuntimeZshData(outDir)` creates, relative to `outDir` and
 * `/`-separated — for packaging checks. All share one top-level directory,
 * the one `loadCorpus` looks for beside the loaded zsh-core module.
 */
export const runtimeZshDataPaths: readonly string[] = vendoredZshDocFiles.map(
  file => `${runtimeZshDataDir}/${file}`,
)

// Three candidate layouts:
//   built:   <baseDir>/data/zsh-docs         (dist/ bundle dir or explicit dist base)
//   dev:     <baseDir>/../data/zsh-docs      (source tree, running from src/assets/)
//   runtime: <baseDir>/zsh-core-data         (consumer copied via copyRuntimeZshData)
/** Locate the vendored Yodl data directory, trying dev/built/runtime candidate paths. */
export function resolveZshDataDir(baseDir = thisDir): string {
  const candidates = [
    join(baseDir, "data", "zsh-docs"),
    join(baseDir, "..", "data", "zsh-docs"),
    join(baseDir, runtimeZshDataDir),
  ]
  const dir = firstExisting(candidates)
  if (dir) return dir
  throw new Error(`zsh docs dir not found: ${candidates.join(", ")}`)
}

/**
 * Copy the vendored Yodl sources into `outDir`, so `loadCorpus` works from a
 * bundle: `outDir` is the directory the bundled zsh-core module runs from
 * (the lookup is relative to the module, not to the working directory).
 * `baseDir` is where the sources are looked up; the default is the installed
 * package.
 */
export function copyRuntimeZshData(outDir: string, baseDir = thisDir): void {
  cpSync(resolveZshDataDir(baseDir), join(outDir, runtimeZshDataDir), {
    recursive: true,
  })
}

function firstExisting(candidates: readonly string[]): string | undefined {
  return candidates.find(cand => existsSync(cand))
}
