import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    include: ["src/test/**/*.test.ts"],
    // Experimental package; no tests yet. Avoid failing workspace-wide
    // `pnpm test` while the adapter is exploratory.
    passWithNoTests: true,
  },
})
