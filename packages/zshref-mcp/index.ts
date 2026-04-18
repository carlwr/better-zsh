/**
 * @packageDocumentation
 *
 * `@carlwr/zshref-mcp` — Model Context Protocol tools over the static zsh
 * reference provided by `zsh-core`. Exports pure tool implementations plus
 * `ToolDef` metadata so adapters (the stdio MCP server, the companion VS
 * Code extension) can register the same tools in their own surfaces.
 *
 * Runtime invariant: every tool is a pure function of `(DocCorpus, input) →
 * output`. Nothing in this package opens a shell, spawns a process, or reads
 * from the user environment. See `DESIGN.md` "MCP as a consumer" for the
 * architectural rationale.
 */

export type { BuildServerOpts } from "./src/server/build-server.ts"
export { buildServer } from "./src/server/build-server.ts"
export * from "./src/tool-defs.ts"
export * from "./src/tools/index.ts"
