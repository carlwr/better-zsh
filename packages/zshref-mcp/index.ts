/**
 * @packageDocumentation
 *
 * MCP server factory for the zshref tool set. Exports `buildServer`; the
 * executable stdio entrypoint is `zshref-mcp`, and the tool surface lives in
 * `@carlwr/zsh-core-tooldef`.
 */

export type { BuildServerOpts } from "./src/server/build-server.ts"
export { buildServer } from "./src/server/build-server.ts"
