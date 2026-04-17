import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "tsup"
import { loadCorpus } from "./src/docs/corpus.ts"
import type { DocCategory } from "./src/docs/taxonomy.ts"
import { docCategories } from "./src/docs/taxonomy.ts"

const pkgDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
const distDir = join(pkgDir, "dist")
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as {
  version: string
}

function fmtJson(data: unknown): string {
  // Keep machine artifacts deterministic and human-readable without a second
  // formatting pass; these files are generated, not edited.
  return `${JSON.stringify(data, null, 2)}\n`
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, fmtJson(data), "utf8")
}

/** Maps each DocCategory to the JSON output filename (without "index.json"). */
const jsonFileName: Record<DocCategory, string> = {
  option: "options.json",
  cond_op: "cond-ops.json",
  builtin: "builtins.json",
  precmd: "precmds.json",
  shell_param: "shell-params.json",
  reserved_word: "reserved-words.json",
  redir: "redirections.json",
  process_subst: "process-substs.json",
  subscript_flag: "subscript-flags.json",
  param_flag: "param-flags.json",
  history: "history.json",
  glob_op: "glob-operators.json",
  glob_flag: "glob-flags.json",
  prompt_escape: "prompt-escapes.json",
  zle_widget: "zle-widgets.json",
}

/** Maps each DocCategory to the camelCase key used in the index.json counts object. */
const countsKey: Record<DocCategory, string> = {
  option: "options",
  cond_op: "condOps",
  builtin: "builtins",
  precmd: "precmds",
  shell_param: "shellParams",
  reserved_word: "reservedWords",
  redir: "redirections",
  process_subst: "processSubsts",
  subscript_flag: "subscriptFlags",
  param_flag: "paramFlags",
  history: "history",
  glob_op: "globOperators",
  glob_flag: "globFlags",
  prompt_escape: "promptEscapes",
  zle_widget: "zleWidgets",
}

function writeJsonArtifacts() {
  const jsonDir = join(distDir, "json")
  mkdirSync(jsonDir, { recursive: true })

  const corpus = loadCorpus()

  // Deterministic file list: sorted by filename for stable index.json.
  const fileNames = docCategories
    .map(cat => jsonFileName[cat])
    .sort() as string[]

  const counts: Record<string, number> = {}
  for (const cat of docCategories) {
    counts[countsKey[cat]] = corpus[cat].size
  }

  const index = {
    version: 1,
    packageVersion: pkg.version,
    files: fileNames,
    counts,
  }

  for (const cat of docCategories) {
    writeJson(join(jsonDir, jsonFileName[cat]), [...corpus[cat].values()])
  }
  writeJson(join(jsonDir, "index.json"), index)
}

;(async () => {
  await build({
    entry: [
      resolve(pkgDir, "index.ts"),
      resolve(pkgDir, "render.ts"),
      resolve(pkgDir, "exec.ts"),
      resolve(pkgDir, "assets.ts"),
      resolve(pkgDir, "zsh-types.ts"),
      resolve(pkgDir, "internal.ts"),
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
