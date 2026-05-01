// MIRRORED-IN: zshref-rs/src/tools/record_fields.rs (augmentWithMarkdown's _id/_display/_subKind projection)

import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "tsup"
import { type DocCorpus, loadCorpus } from "./src/docs/corpus.ts"
import { jsonArtifact, jsonDataFiles } from "./src/docs/json-artifacts.ts"
import { hookNames } from "./src/docs/resolver.ts"
import {
  classifyOrder,
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docDisplay,
  docId,
  docSubKind,
  mkPieceId,
} from "./src/docs/taxonomy.ts"
import type { Documented } from "./src/docs/types.ts"
import { PKG_VERSION } from "./src/meta/pkg-info.ts"
import { ZSH_UPSTREAM } from "./src/meta/zsh-upstream.ts"
import { renderDoc } from "./src/render/md.ts"

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

/**
 * Augment each record with its rendered markdown body (`mdBody`) and the
 * projected identity fields consumed by out-of-process consumers (the Rust
 * CLI). `_id`/`_display`/`_subKind` use underscore-prefixed names to avoid
 * collisions with existing record fields (`display` on ZshOption,
 * `subKind` on ParamExpnDoc).
 */
function augmentWithMarkdown<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
): readonly (DocRecordMap[K] & {
  readonly mdBody: string
  readonly _id: string
  readonly _display: string
  readonly _subKind?: string
})[] {
  const map = corpus[cat] as ReadonlyMap<Documented<K>, DocRecordMap[K]>
  return [...map.entries()].map(([id, rec]) => {
    const subKind = docSubKind[cat](rec as never)
    return {
      ...rec,
      mdBody: renderDoc(corpus, mkPieceId(cat, id)),
      _id: docId[cat](rec as never) as string,
      _display: docDisplay(cat, rec as never),
      ...(subKind !== undefined ? { _subKind: subKind } : {}),
    }
  })
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

/**
 * Strong gate: `_id`/`_display` must be ASCII. The Rust CLI's fuzzy scorer
 * is ASCII-only — non-ASCII would silently degrade search for the
 * affected records. Mirrors the corpus-load test on the Rust side.
 */
function assertAsciiIdentity(
  cat: DocCategory,
  records: readonly { readonly _id: string; readonly _display: string }[],
): void {
  const violations: string[] = []
  for (const rec of records) {
    if (!isAscii(rec._id))
      violations.push(`${cat}: _id ${JSON.stringify(rec._id)}`)
    if (!isAscii(rec._display))
      violations.push(`${cat}: _display ${JSON.stringify(rec._display)}`)
  }
  if (violations.length > 0) {
    throw new Error(
      `non-ASCII _id/_display in corpus (Rust fuzzy scorer is ASCII-only):\n  ${violations.join("\n  ")}`,
    )
  }
}

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false
  }
  return true
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
