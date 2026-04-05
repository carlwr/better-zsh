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
    noExternal: ["zsh-core"],
    watch: process.argv.includes("--watch"),
  })
  await generateAssets()
})()
