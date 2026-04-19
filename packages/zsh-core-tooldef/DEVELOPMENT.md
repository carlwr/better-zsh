# DEVELOPMENT

Framework-neutral tool definitions built on `@carlwr/zsh-core`. The package holds pure implementations plus `ToolDef` metadata; every consumer (MCP, CLI, extension) walks `toolDefs` to register the same set of tools in its own surface.

## Architectural invariants

- **Pure tool implementations.** Files under `src/tools/` are `(DocCorpus, input) → output`. No `child_process`, no networking, no `node:fs`, no `process.env`, no `vscode`. The tool layer never looks at process env or disk; the corpus is passed in.
- **Shared `ToolDef` metadata.** `src/tool-defs.ts` is the single source of tool name, description, JSON-Schema input, and an `execute` wrapper. Adapters walk `toolDefs` uniformly — no per-tool switch statements at adapter level.
- **Adapter-agnostic.** This package depends on `@carlwr/zsh-core` only; it knows nothing about MCP, cliffy, or VS Code. Consumers wrap it.

## Tool naming: the `zsh_` prefix

Every tool is named `zsh_<verb>[_<object>]`. Collision avoidance + domain priming in MCP clients' flat tool namespace. See `packages/zshref-mcp/DEVELOPMENT.md` §"Tool naming" for full rationale. Keep the prefix on every new tool; `snake_case` throughout.

## Adding a new tool

1. New file under `src/tools/`: export I/O types, a pure `(corpus, input) → result` function, and a `*ToolDef` constant. No execution, network, env, `node:fs`, or `vscode` imports.
2. Re-export from `src/tools/index.ts`.
3. In `src/tool-defs.ts`: re-export the `*ToolDef` and push it into `toolDefs`.
4. Unit tests under `src/test/tools/<tool>.test.ts`: happy path + one negative + any quirk the tool promises.
5. Metadata assertions in `src/test/tool-defs.test.ts`.
6. `pnpm run check && pnpm run test` — the scope fence trips on stray imports.

Any category enumeration in tool descriptions must be interpolated from zsh-core exports (see `AGENTS.md`).

## Scope fence

`src/test/scope.test.ts` walks every `.ts` file under `src/tools/` and rejects forbidden imports (`child_process`, networking modules, `node:fs`, `vscode`) and `process.env` reads. Structural backing for the "no execution, no environment access" promise advertised by the MCP and CLI. Loosening requires a deliberate change to the forbidden list here and to the consumers' copy.

## Consumers

- `@carlwr/zshref-mcp` — stdio MCP server; registers tools via MCP SDK.
- `@carlwr/zshref` — CLI bin; cliffy subcommand per tool, JSON on stdout.
- `vscode-better-zsh` — VS Code extension; registers tools via `vscode.lm.registerTool`.

Cross-package note: the VS Code extension's `contributes.languageModelTools` manifest mirrors each `ToolDef`'s name + description + inputSchema. A test in the extension (`src/test/zsh-ref-tools.test.ts`) asserts full equality; update the manifest when adding or editing a tool here.
