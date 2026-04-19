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
    // zsh-core / tooldef stay external — consumers resolve them from
    // node_modules at runtime. Cliffy is NOT external: the esbuild alias
    // below rewrites `@cliffy/command` → `@jsr/cliffy__command` before
    // external-matching, so cliffy ends up inlined into the bin. That's
    // by design — it removes the JSR-registry requirement for end users,
    // and cliffy is only listed as a devDependency in `package.json`.
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
      options.alias = {
        ...(options.alias ?? {}),
        "@cliffy/command": "@jsr/cliffy__command",
        "@cliffy/command/completions": "@jsr/cliffy__command/completions",
      }
    },
  })

  // Preserve executable bit on the bin entry so `npm install -g` wires it up.
  for (const path of [join(distDir, "bin.mjs"), join(distDir, "bin.js")]) {
    if (existsSync(path)) chmodSync(path, 0o755)
  }

  // Sanity check on shebang preservation (tsup retains it in ESM output by
  // default; a future esbuild change dropping it would break the bin).
  const esm = readFileSync(join(distDir, "bin.mjs"), "utf8")
  if (!esm.startsWith("#!")) {
    throw new Error(
      "bin.mjs missing shebang; bin entry would not be directly executable",
    )
  }
})()
