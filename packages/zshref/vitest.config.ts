import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    include: ["src/test/**/*.test.ts"],
    alias: {
      "@cliffy/command/completions": "@jsr/cliffy__command/completions",
      "@cliffy/command": "@jsr/cliffy__command",
    },
  },
})
