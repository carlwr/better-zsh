import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    include: ["src/test/**/*.test.ts"],
    exclude: [
      "src/test/integration/**",
      "src/test/bundled/**",
      "src/test/zsh-path-matrix/**",
    ],
    pool: "threads",
  },
  resolve: {
    alias: { vscode: "/dev/null" },
  },
})
