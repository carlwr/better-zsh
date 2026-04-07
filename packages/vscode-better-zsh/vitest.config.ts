import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    include: ["src/test/**/*.test.ts"],
    exclude: ["src/test/integration/**", "src/test/bundled/**"],
  },
  resolve: {
    alias: { vscode: "/dev/null" },
  },
})
