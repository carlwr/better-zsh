import adapter from "@sveltejs/adapter-static"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // No `fallback`: the one prerendered page gets relative asset paths, so
    // the build serves from any base path; `strict` fails it if a dynamic
    // route returns.
    adapter: adapter({
      precompress: false,
      strict: true,
    }),
    prerender: { entries: ["*"] },
    // The app's one import into nlp/: the facade file, not the dir — so
    // `$nlp/x` resolves nowhere (`tests/import-fence.test.ts`).
    alias: { $nlp: "nlp/browser.ts" },
    typescript: {
      // The generated tsconfig reaches src/ and tests/ only; the NLP and the
      // scripts sit beside them. Paths are relative to .svelte-kit/.
      config: tsconfig => {
        tsconfig.include.push("../nlp/**/*.ts", "../scripts/**/*.ts")
      },
    },
  },
}

export default config
