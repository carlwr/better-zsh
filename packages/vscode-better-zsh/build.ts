import { build } from "tsdown"
import { stageExtension } from "./src/build/extension-stage"
import { generateAssets } from "./src/build/generate-assets"
import { outDir, pkgDir } from "./src/build/paths"

;(async () => {
  await build({
    config: false,
    cwd: pkgDir,
    entry: ["src/extension.ts"],
    outDir,
    platform: "node",
    format: ["cjs"],
    // VS Code loads `main` as CJS; keep the `.js` name it points at.
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: true,
    logLevel: "warn",
    // Everything but the VS Code API is bundled; `dependencies` are
    // otherwise externalized by default.
    deps: { neverBundle: ["vscode"], alwaysBundle: [/^@carlwr\//] },
    inputOptions: {
      resolve: { conditionNames: ["require", "node"], mainFields: ["main"] },
    },
  })
  generateAssets()
  stageExtension()
})()
