/**
 * @packageDocumentation
 *
 * `@carlwr/zsh-core-tooldef` — declarative tool definitions on the static
 * zsh reference from `@carlwr/zsh-core`. Framework-neutral `ToolDef`
 * metadata plus pure `(DocCorpus, input) → output` implementations.
 * Adapters walk `toolDefs` to register the same tools on each surface.
 *
 * Runtime invariant: every tool is pure — no shell, subprocess, `node:fs`,
 * or process env. Rationale lives in `DESIGN.md`; package tests enforce
 * the structural scope fence.
 */

export * from "./src/tool-defs.ts"
export * from "./src/tools/index.ts"
