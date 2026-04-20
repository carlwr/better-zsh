# DEVELOPMENT

Framework-neutral tool definitions built on `@carlwr/zsh-core`.
This package owns the pure tool implementations plus `ToolDef` metadata; every consumer walks `toolDefs`.

## Architectural invariants

- Files under `src/tools/` are pure `(DocCorpus, input) → output`.
- No `child_process`, networking, `node:fs`, `process.env`, or `vscode` in the tool layer.
- `src/tool-defs.ts` is the single source of tool name, description, JSON-Schema input, and execute wrapper.
- The package knows about zsh-core only, not MCP, cliffy, or VS Code.

## Tool naming

Tools are named `zsh_<verb>[_<object>]`.
Keep the `zsh_` prefix and use `snake_case`.
For the rationale, see `packages/zshref-mcp/DEVELOPMENT.md`.

## Adding a tool

- Add a file under `src/tools/` exporting I/O types, a pure implementation, and a `*ToolDef` constant.
- Re-export it from `src/tools/index.ts`.
- Re-export the `*ToolDef` from `src/tool-defs.ts` and add it to `toolDefs`.
- Add unit tests under `src/test/tools/<tool>.test.ts`.
- Extend metadata assertions in `src/test/tool-defs.test.ts`.
- Run `pnpm run check && pnpm run test`.

Any category enumeration in tool descriptions must come from zsh-core exports; do not hand-type it.

## Scope fence

`src/test/scope.test.ts` walks `src/tools/` and rejects forbidden imports plus `process.env` reads. This is the structural backing for the "no execution, no environment access" promise advertised by the MCP and CLI. Loosening it is a deliberate product decision, not a casual implementation change.

## Consumers

- `@carlwr/zshref-mcp` — stdio MCP server.
- `@carlwr/zshref` — CLI bin.
- `vscode-better-zsh` — VS Code LM tools.

Cross-package note: the VS Code extension manifest mirrors each `ToolDef`'s name, description, and `inputSchema`; an extension test asserts the equality.
