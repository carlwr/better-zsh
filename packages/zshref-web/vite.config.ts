import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [sveltekit()],
  // transformers.js + ORT-Web ship WASM/binary assets that should not be
  // touched by Vite's optimizer; the runtime fetches them from a CDN.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  ssr: { noExternal: ["shiki"] },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/_setup-fast-check.ts"],
    environment: "node",
    // A file over the staged model spins an ORT thread pool of every core;
    // the worker count multiplies that, so few workers keep a cold run
    // (no query cache yet) responsive.
    maxWorkers: 2,
  },
})
