# DEVELOPMENT

Framework-neutral tool definitions built on `@carlwr/zsh-core`.
This package owns the pure tool implementations plus `ToolDef` metadata; every consumer walks `toolDefs`.

## Architectural invariants

- Files under `src/tools/` and `src/tools/shared/` are pure `(DocCorpus, input) → output`.
- No `child_process`, networking, `node:fs`, `process.env`, or `vscode` in the tool layer.
- `src/tool-defs.ts` is the single source of tool name, description, input + output JSON Schemas, and execute wrapper.
- The package knows about zsh-core only.

## Tool naming

Tools are named `zsh_<verb>[_<object>]`; keep the `zsh_` prefix, use `snake_case`, never move `zsh` into the middle or tail. Why:

- MCP clients present tools from multiple servers in one flat namespace; the prefix avoids collisions with generic tool names
- the prefix primes domain reasoning and makes logs self-describing

## `brief` vs `flagBriefs` vs `description`

Each `ToolDef` carries three docstring-like fields. The asymmetry is load-bearing:

- `description` — long-form prose shown in LLM tool selection and full CLI help blocks. MCP consumes this directly; it is the source of truth for LLM-facing docs.
- `brief` — ≤50-char phrase for narrow rendering contexts: the CLI help's commands column, UI list rows, any surface with a column budget.
- `flagBriefs[key]` — ≤60-char per-flag phrase keyed by schema property; CLI help's flag column.

MCP ignores `brief` and `flagBriefs` — LLM-facing surfaces have no column budget. The CLI consumes all three: clap's commands column, `long_about`, and per-flag `help` would wrap badly on the default ~80-col terminal if fed the long-form `description` strings. `buildToolDef` enforces at compile time that the per-flag prose keys are exactly the schema's property keys, and that `required` lists only reference actual properties — so adding a flag without a brief, or referencing a non-existent flag in `required`, is a type error rather than a rendering bug.

A consumer that needs neither short form reads only `description`; a consumer that needs narrow rendering reads the briefs too. The one tooldef record serves both.

## Adding a tool

- Add `src/tools/<tool>.ts` exporting I/O types, a pure implementation, and a `*ToolDef` constant.
- Re-export it from `src/tools.ts`.
- Re-export the `*ToolDef` from `src/tool-defs.ts` and add it to `toolDefs`.
- Author the `outputSchema` co-located with the result type alias; use `mkOutputSchema` (in `src/tools/shared/output-schema.ts`) so per-category `subKind` enums and `category` enums interpolate from canonical zsh-core tables. See DESIGN.md §"Output schemas (tooldef-owned)".
- Add unit tests under `src/test/tools/<tool>.test.ts`.
- Extend metadata assertions in `src/test/tool-defs.test.ts`.
- Run `pnpm run check && pnpm run test`.

Any category enumeration in tool descriptions must come from zsh-core exports; do not hand-type it.

## Scope fence

`src/test/scope.test.ts` walks `src/tools/` and rejects forbidden imports plus `process.env` reads: the structural backing for the tool layer's "no execution, no environment access" promise. Loosening it is a deliberate product decision, not a casual implementation change.

## Consumers

- `zshref-rs/` — the `zshref` CLI and the `zshref-mcp` MCP server; consume the tool-def JSON artifact this package generates, baked into the binaries via `include_bytes!`.
