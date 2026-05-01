import { build } from "tsup"
import { generateAssets } from "./src/build/generate-assets"
import { outDir } from "./src/build/paths"

;(async () => {
  await build({
    entry: ["src/extension.ts"],
    outDir,
    format: ["cjs"],
    sourcemap: true,
    clean: true,
    external: ["vscode"],
    noExternal: [
      "@carlwr/zsh-core",
      "@carlwr/zsh-core/analysis",
      "@carlwr/zsh-core/meta",
      "@carlwr/zsh-core/render",
      "@carlwr/zsh-core/resolver",
      "@carlwr/zsh-core/taxonomy",
      "@carlwr/zsh-core/types",
      "@carlwr/zsh-core-tooldef",
    ],
    watch: process.argv.includes("--watch"),
    esbuildOptions(options) {
      options.conditions = ["require", "node"]
      options.mainFields = ["main"]
      options.logOverride = {
        ...(options.logOverride ?? {}),
        "empty-import-meta": "silent",
      }
    },
  })
  await generateAssets()
})()
