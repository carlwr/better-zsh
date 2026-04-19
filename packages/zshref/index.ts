/**
 * @packageDocumentation
 *
 * `@carlwr/zshref` — CLI over `@carlwr/zsh-core-tooldef`. One layer above
 * `zsh-core`: walks the framework-neutral `toolDefs` list and exposes each
 * tool as a cliffy subcommand emitting a JSON payload on stdout.
 *
 * The library surface exports the adapter (`buildCli`) so tests can drive
 * the cliffy tree without spawning the bin. The bin itself lives in
 * `./bin.ts` and is the primary deliverable (`package.json.bin`).
 *
 * Runtime invariant: the tool layer (imported from tooldef) is a pure
 * function of `(DocCorpus, input) → output`. This package adds only
 * argv-parsing glue and JSON output.
 */

export type { BuildCliOpts } from "./src/adapter.ts"
export { buildCli, runCli, subcommandName } from "./src/adapter.ts"
