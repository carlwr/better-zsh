import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "tsup"
import { writeToolDefsJson } from "./src/export-json.ts"
import { TOOL_SUITE_PREAMBLE, toolDefs } from "./src/tool-defs.ts"

const pkgDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
const distDir = join(pkgDir, "dist")

;(async () => {
  await build({
    entry: [resolve(pkgDir, "index.ts")],
    outDir: distDir,
    tsconfig: resolve(pkgDir, "tsconfig.build.json"),
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
    external: ["@carlwr/zsh-core", "@carlwr/zsh-core/render", "fuzzysort"],
    shims: true,
    watch: process.argv.includes("--watch"),
    esbuildOptions(options) {
      options.logOverride = {
        ...(options.logOverride ?? {}),
        "empty-import-meta": "silent",
      }
    },
  })

  writeToolDefsJson(toolDefs, TOOL_SUITE_PREAMBLE, join(distDir, "json"))
})()
