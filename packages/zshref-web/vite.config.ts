import { sveltekit } from "@sveltejs/kit/vite"
import { defaultClientConditions } from "vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [sveltekit()],
  // transformers.js + ORT-Web ship WASM/binary assets that should not be
  // touched by Vite's optimizer; the runtime fetches them from a CDN.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  // ORT-Web's default build embeds its loader and references its `.wasm`,
  // which Vite then emits (~27 MB) — dead weight: transformers.js points
  // `wasmPaths` at jsDelivr. This export condition picks ORT's build that
  // loads both from `wasmPaths` only.
  resolve: {
    conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions],
  },
  // Bundled packages' licences; the default path, `.vite/`, never reaches
  // `build/` (adapter-static skips it).
  build: { license: { fileName: "THIRD_PARTY_LICENSES.md" } },
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
