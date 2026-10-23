/**
 * Package version as a constant.
 * In `.ts` (not read from `package.json` at runtime): survives bundling and
 * needs no file system. `src/test/pkg-info.test.ts` enforces sync with
 * `package.json`.
 */

export const PKG_VERSION = "0.1.0-alpha.3"
