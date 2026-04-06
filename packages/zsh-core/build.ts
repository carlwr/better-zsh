import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "tsup"
import {
  getBuiltins,
  getCondOps,
  getGlobbingFlags,
  getGlobOps,
  getHistoryDocs,
  getOptions,
  getParamFlags,
  getPrecmds,
  getProcessSubsts,
  getRedirections,
  getReservedWords,
  getSubscriptFlags,
} from "./src/zsh-data.ts"

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

function writeJsonArtifacts() {
  const jsonDir = join(distDir, "json")
  mkdirSync(jsonDir, { recursive: true })

  const options = getOptions()
  const condOps = getCondOps()
  const builtins = getBuiltins()
  const precmds = getPrecmds()
  const redirections = getRedirections()
  const reservedWords = getReservedWords()
  const subscriptFlags = getSubscriptFlags()
  const paramFlags = getParamFlags()
  const history = getHistoryDocs()
  const globOperators = getGlobOps()
  const globFlags = getGlobbingFlags()
  const processSubsts = getProcessSubsts()
  const docs = {
    version: 1,
    packageVersion: pkg.version,
    files: [
      "builtins.json",
      "cond-ops.json",
      "glob-flags.json",
      "glob-operators.json",
      "history.json",
      "options.json",
      "param-flags.json",
      "precmds.json",
      "process-substs.json",
      "redirections.json",
      "reserved-words.json",
      "subscript-flags.json",
    ] as const,
    counts: {
      builtins: builtins.length,
      condOps: condOps.length,
      globFlags: globFlags.length,
      globOperators: globOperators.length,
      history: history.length,
      options: options.length,
      paramFlags: paramFlags.length,
      precmds: precmds.length,
      processSubsts: processSubsts.length,
      redirections: redirections.length,
      reservedWords: reservedWords.length,
      subscriptFlags: subscriptFlags.length,
    },
  }

  const files = new Map<string, unknown>([
    ["options.json", options],
    ["cond-ops.json", condOps],
    ["builtins.json", builtins],
    ["precmds.json", precmds],
    ["redirections.json", redirections],
    ["reserved-words.json", reservedWords],
    ["subscript-flags.json", subscriptFlags],
    ["param-flags.json", paramFlags],
    ["history.json", history],
    ["glob-operators.json", globOperators],
    ["glob-flags.json", globFlags],
    ["process-substs.json", processSubsts],
    ["index.json", docs],
  ])

  for (const [name, data] of files) {
    writeJson(join(jsonDir, name), data)
  }
}

;(async () => {
  await build({
    entry: [
      resolve(pkgDir, "index.ts"),
      resolve(pkgDir, "render.ts"),
      resolve(pkgDir, "exec.ts"),
      resolve(pkgDir, "assets.ts"),
      resolve(pkgDir, "zsh-types.ts"),
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
