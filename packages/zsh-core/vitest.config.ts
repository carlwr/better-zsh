import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    include: ["src/test/**/*.test.ts"],
    setupFiles: ["src/test/setup-fast-check.ts"],
  },
})
