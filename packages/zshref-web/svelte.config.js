import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    prerender: { entries: ['*'] },
    typescript: {
      // The generated tsconfig reaches src/ and tests/ only; the Node-side
      // NLP code sits beside them. Paths are relative to .svelte-kit/.
      config: (tsconfig) => {
        tsconfig.include.push('../nlp/**/*.ts', '../scripts/**/*.ts');
      }
    }
  }
};

export default config;
