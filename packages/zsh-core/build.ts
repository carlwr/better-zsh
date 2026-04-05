import { cpSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { build } from "tsup"

const pkgDir = __dirname
const distDir = join(pkgDir, "dist")

;(async () => {
  await build({
    entry: [resolve(pkgDir, "index.ts"), resolve(pkgDir, "assets.ts")],
    outDir: distDir,
    tsconfig: resolve(pkgDir, "tsconfig.build.json"),
    format: ["cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
    watch: process.argv.includes("--watch"),
  })

  mkdirSync(join(distDir, "data"), { recursive: true })
  cpSync(
    resolve(pkgDir, "src", "data", "zsh-docs"),
    resolve(distDir, "data", "zsh-docs"),
    { recursive: true },
  )
})()
