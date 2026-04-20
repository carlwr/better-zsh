import { chmodSync, existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "tsup"

const pkgDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))
const distDir = join(pkgDir, "dist")

;(async () => {
  await build({
    entry: [resolve(pkgDir, "index.ts"), resolve(pkgDir, "bin.ts")],
    outDir: distDir,
    tsconfig: resolve(pkgDir, "tsconfig.build.json"),
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
    external: [
      "@carlwr/zsh-core",
      "@carlwr/zsh-core/render",
      "@carlwr/zsh-core-tooldef",
    ],
    shims: true,
    watch: process.argv.includes("--watch"),
    esbuildOptions(options) {
      options.logOverride = {
        ...(options.logOverride ?? {}),
        "empty-import-meta": "silent",
      }
    },
  })

  for (const path of [join(distDir, "bin.mjs"), join(distDir, "bin.js")]) {
    if (existsSync(path)) chmodSync(path, 0o755)
  }

  const esm = readFileSync(join(distDir, "bin.mjs"), "utf8")
  if (!esm.startsWith("#!")) {
    throw new Error("bin.mjs missing shebang")
  }
})()
