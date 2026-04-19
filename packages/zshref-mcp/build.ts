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
    entry: [resolve(pkgDir, "index.ts"), resolve(pkgDir, "server.ts")],
    outDir: distDir,
    tsconfig: resolve(pkgDir, "tsconfig.build.json"),
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
    // Keep dependencies external so the MCP SDK and zsh-core are resolved
    // from node_modules at runtime (not inlined into our bundles).
    external: [
      "@modelcontextprotocol/sdk",
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

  // Preserve executable bit on the stdio server entry so the `bin` field
  // works for npm users that install the package globally.
  for (const path of [
    join(distDir, "server.mjs"),
    join(distDir, "server.js"),
  ]) {
    if (existsSync(path)) chmodSync(path, 0o755)
  }

  // Sanity check on shebang preservation (tsup retains it in ESM output by
  // default; if some future esbuild change drops it, we want to know here).
  const esm = readFileSync(join(distDir, "server.mjs"), "utf8")
  if (!esm.startsWith("#!")) {
    throw new Error(
      "server.mjs missing shebang; bin entry would not be directly executable",
    )
  }
})()
