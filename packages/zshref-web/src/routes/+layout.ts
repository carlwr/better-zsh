// SPA-style: no per-request server data, the app is prerendered as a
// static shell. The browser fetches artifacts at runtime.
export const prerender = true
// Load-bearing for `?r=` permalinks (`+page.svelte` reads `page.url`): with
// SSR on, prerendering would throw on the search-params read.
export const ssr = false
