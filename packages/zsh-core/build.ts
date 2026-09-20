import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "tsup"
import { buildResolverFixture } from "./scripts/resolver-fixture.ts"
import { loadCorpus } from "./src/docs/corpus.ts"
import {
  fmtJson,
  hashRecordFiles,
  jsonDataFile,
  jsonDataFiles,
  jsonRecordTexts,
  resolverFixture,
} from "./src/docs/json-artifacts.ts"
import type { JsonIndex } from "./src/docs/json-types.ts"
import {
  resolverFeedbackKindSchemas,
  resolverFeedbackKinds,
} from "./src/docs/resolver.ts"
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
const fixtureDir = join(pkgDir, "artifacts", resolverFixture.dir)

/**
 * One bundle per non-glob `exports` subpath, read from the manifest rather
 * than restated: a subpath added without a bundle would resolve to nothing.
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

function writeJson(path: string, data: unknown) {
  writeFileSync(path, fmtJson(data), "utf8")
}

function writeJsonArtifacts() {
  for (const dir of [jsonDir, fixtureDir]) {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
  }

  const corpus = loadCorpus()

  const recordTexts = jsonRecordTexts(corpus)
  for (const [file, text] of recordTexts) {
    writeFileSync(join(jsonDir, file), text, "utf8")
  }

  const categoryFiles = Object.fromEntries(
    docCategories.map(cat => [cat, jsonDataFile(cat)]),
  ) as JsonIndex["categoryFiles"]

  const dataHash = hashRecordFiles(recordTexts)
  const index: JsonIndex = {
    version: 3,
    packageVersion: PKG_VERSION,
    zshUpstream: ZSH_UPSTREAM,
    dataHash,
    files: [...jsonDataFiles],
    // Canonical taxonomy lists, consumed by out-of-process consumers (the
    // Rust crate) as the source of truth — no Rust-side mirror.
    docCategories: [...docCategories],
    classifyOrder: [...classifyOrder],
    categoryFiles,
    docCategoryLabels: { ...docCategoryLabels },
    resolverFeedbackKindSchemas: resolverFeedbackKinds.map(
      kind => resolverFeedbackKindSchemas[kind],
    ),
  }

  writeJson(join(jsonDir, "index.json"), index)
  writeJson(
    join(fixtureDir, resolverFixture.file),
    buildResolverFixture(corpus, { packageVersion: PKG_VERSION, dataHash }),
  )
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
