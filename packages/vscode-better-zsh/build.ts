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
    // Everything but the VS Code API is bundled; `dependencies` are
    // otherwise externalized by default.
    noExternal: [/^@carlwr\//],
    esbuildOptions(options) {
      options.conditions = ["require", "node"]
      options.mainFields = ["main"]
      options.logOverride = {
        ...(options.logOverride ?? {}),
        "empty-import-meta": "silent",
      }
    },
  })
  generateAssets()
})()
