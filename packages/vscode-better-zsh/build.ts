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
      "zsh-core",
      "@carlwr/zsh-ref-mcp",
      "@modelcontextprotocol/sdk",
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
