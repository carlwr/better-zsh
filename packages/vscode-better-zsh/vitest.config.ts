import { resolve } from "node:path"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    include: ["src/test/**/*.test.ts"],
    // Electron-hosted suites; run by `.vscode-test.mjs`.
    exclude: [
      ...configDefaults.exclude,
      "src/test/integration/**",
      "src/test/bundled/**",
      "src/test/zsh-path-matrix/**",
    ],
    setupFiles: ["src/test/setup-fast-check.ts"],
    pool: "threads",
  },
  resolve: {
    alias: { vscode: resolve(__dirname, "src/test/vscode-stub.ts") },
  },
})
