import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "tsup"
import { loadCorpus } from "./src/docs/corpus.ts"
import {
  hashRecordFiles,
  jsonArtifact,
  jsonDataFiles,
} from "./src/docs/json-artifacts.ts"
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
const jsonDir = join(pkgDir, "artifacts", "json")

/**
 * One bundle per non-glob `exports` subpath, read from the manifest rather
 * than restated: a subpath added without a bundle would resolve to nothing.
 * Same derivation as `scripts/test-pack.ts`, which asserts the published shape.
 */
const publicEntries: string[] = Object.keys(
  (
    JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as {
      exports: Record<string, unknown>
    }
  ).exports,
)
  .filter(sub => !sub.includes("*") && sub !== "./package.json")
  .map(sub => (sub === "." ? "index" : sub.slice(2)))
  .sort()

function fmtJson(data: unknown): string {
  // Keep machine artifacts deterministic and human-readable without a second
  // formatting pass; these files are generated, not edited.
  return `${JSON.stringify(data, null, 2)}\n`
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, fmtJson(data), "utf8")
}

function writeJsonArtifacts() {
  rmSync(jsonDir, { recursive: true, force: true })
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

  const recordTexts = new Map<string, string>()
  for (const cat of docCategories) {
    const augmented = augmentWithMarkdown(corpus, cat)
    assertAsciiIdentity(cat, augmented)
    const { file } = jsonArtifact[cat]
    const text = fmtJson(augmented)
    recordTexts.set(file, text)
    writeFileSync(join(jsonDir, file), text, "utf8")
  }

  const index = {
    version: 1,
    packageVersion: PKG_VERSION,
    zshUpstream: ZSH_UPSTREAM,
    dataHash: hashRecordFiles(recordTexts),
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

  writeJson(join(jsonDir, "index.json"), index)
}

;(async () => {
  await build({
    entry: publicEntries.map(name => resolve(pkgDir, `${name}.ts`)),
    outDir: distDir,
    tsconfig: resolve(pkgDir, "tsconfig.build.json"),
    format: ["cjs", "esm"],
    // tsup injects `baseUrl` into its dts build; TS6 rejects it (TS5101).
    dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
    clean: true,
    sourcemap: true,
    target: "es2022",
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
