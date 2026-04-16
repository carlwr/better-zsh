/**
 * Internal re-exports for monorepo consumers (test fixtures, build tooling).
 * NOT part of the public API surface. These mint brand values without corpus
 * checks — misuse in production code defeats the type-level guarantees.
 */
export { mkDocumented, normalizeOptName } from "./src/docs/brands.ts"
