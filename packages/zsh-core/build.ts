import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "tsup"
import { loadCorpus } from "./src/docs/corpus.ts"
import { jsonArtifact, jsonDataFiles } from "./src/docs/json-artifacts.ts"
import {
  assertAsciiIdentity,
  augmentWithMarkdown,
} from "./src/docs/json-projection.ts"
import { hookNames } from "./src/docs/resolver.ts"
import {
  classifyOrder,
  docCategories,
  docCategoryLabels,
} from "./src/docs/taxonomy.ts"
import { PKG_VERSION } from "./src/meta/pkg-info.ts"
import { ZSH_UPSTREAM } from "./src/meta/zsh-upstream.ts"

const pkgDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
const distDir = join(pkgDir, "dist")

function fmtJson(data: unknown): string {
  // Keep machine artifacts deterministic and human-readable without a second
  // formatting pass; these files are generated, not edited.
  return `${JSON.stringify(data, null, 2)}\n`
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, fmtJson(data), "utf8")
}

function writeJsonArtifacts() {
  const jsonDir = join(distDir, "json")
  mkdirSync(jsonDir, { recursive: true })

  const corpus = loadCorpus()

  const counts: Record<string, number> = {}
  for (const cat of docCategories) {
    counts[jsonArtifact[cat].count] = corpus[cat].size
  }

  const categoryFiles: Record<string, string> = {}
  for (const cat of docCategories) {
    categoryFiles[cat] = jsonArtifact[cat].file
  }

  const index = {
    version: 1,
    packageVersion: PKG_VERSION,
    zshUpstream: ZSH_UPSTREAM,
    files: [...jsonDataFiles],
    counts,
    // Canonical taxonomy lists, consumed by out-of-process consumers (the
    // Rust CLI) as the source of truth — no Rust-side mirror.
    docCategories: [...docCategories],
    classifyOrder: [...classifyOrder],
    /** Per-category JSON filename — pairs `docCategories[i]` with the file holding its records. */
    categoryFiles,
    /** Human-readable per-category labels — SoT for display surfaces. */
    docCategoryLabels: { ...docCategoryLabels },
    /** Hook base names used by the special_function resolver (`*_functions` suffix pattern). */
    hookNames: [...hookNames],
  }

  for (const cat of docCategories) {
    const augmented = augmentWithMarkdown(corpus, cat)
    assertAsciiIdentity(cat, augmented)
    writeJson(join(jsonDir, jsonArtifact[cat].file), augmented)
  }
  writeJson(join(jsonDir, "index.json"), index)
}

;(async () => {
  await build({
    entry: [
      resolve(pkgDir, "analysis.ts"),
      resolve(pkgDir, "assets.ts"),
      resolve(pkgDir, "exec.ts"),
      resolve(pkgDir, "index.ts"),
      resolve(pkgDir, "meta.ts"),
      resolve(pkgDir, "render.ts"),
      resolve(pkgDir, "resolver.ts"),
      resolve(pkgDir, "taxonomy.ts"),
      resolve(pkgDir, "types.ts"),
    ],
    outDir: distDir,
    tsconfig: resolve(pkgDir, "tsconfig.build.json"),
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
    watch: process.argv.includes("--watch"),
    esbuildOptions(options) {
      options.logOverride = {
        ...(options.logOverride ?? {}),
        "empty-import-meta": "silent",
      }
    },
  })

  mkdirSync(join(distDir, "data"), { recursive: true })
  cpSync(
    resolve(pkgDir, "src", "data", "zsh-docs"),
    resolve(distDir, "data", "zsh-docs"),
    { recursive: true },
  )
  writeJsonArtifacts()
})()
