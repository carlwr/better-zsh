/**
 * @packageDocumentation
 *
 * `@carlwr/zshref-mcp` — Model Context Protocol server projecting
 * `@carlwr/zsh-core-tooldef`'s tool definitions over stdio. Exports the
 * server factory (`buildServer`); the tool surface itself lives in
 * `@carlwr/zsh-core-tooldef` and is re-exported from there by adapters.
 *
 * Runtime invariant: the tool layer (imported from tooldef) is a pure
 * function of `(DocCorpus, input) → output`. This package adds only the
 * MCP SDK glue and stdio transport. See `DESIGN.md` "MCP as a consumer"
 * for the architectural rationale.
 */

export type { BuildServerOpts } from "./src/server/build-server.ts"
export { buildServer } from "./src/server/build-server.ts"
