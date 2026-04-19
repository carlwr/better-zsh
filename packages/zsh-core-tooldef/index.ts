/**
 * @packageDocumentation
 *
 * `@carlwr/zsh-core-tooldef` — declarative tool definitions built on the
 * static zsh reference provided by `@carlwr/zsh-core`. One layer above
 * `zsh-core`: framework-neutral metadata (`ToolDef`) plus pure
 * `(DocCorpus, input) → output` implementations. Adapters (MCP server,
 * CLI, VS Code extension) walk `toolDefs` uniformly to register the same
 * set of tools in their own surfaces.
 *
 * Runtime invariant: every tool is a pure function. Nothing in this
 * package opens a shell, spawns a process, reads `node:fs`, or touches
 * process env. See `DESIGN.md` "MCP as a consumer" for the architectural
 * rationale; the scope fence under `src/test/` enforces it structurally.
 */

export * from "./src/tool-defs.ts"
export * from "./src/tools/index.ts"
