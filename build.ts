import { build } from "tsup"
import { generateAssets } from "./src/build/generate-assets"

;(async () => {
  await build({
    entry: ["src/extension.ts"],
    outDir: "out",
    format: ["cjs"],
    sourcemap: true,
    clean: true,
    external: ["vscode"],
    watch: process.argv.includes("--watch"),
  })
  await generateAssets()
})()
