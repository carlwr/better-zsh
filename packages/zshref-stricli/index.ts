/**
 * @packageDocumentation
 *
 * Experimental stricli variant of `@carlwr/zshref`. Library surface exposes
 * the app builder so tests / alternate drivers can exercise the tree
 * without spawning the bin.
 */

export type { BuildAppOpts } from "./src/adapter.ts"
export { buildApp, subcommandName } from "./src/adapter.ts"
