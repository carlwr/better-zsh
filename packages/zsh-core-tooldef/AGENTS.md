---
audience: maintainer
read-when: working in packages/zsh-core-tooldef/
---

# AGENTS.md — `@carlwr/zsh-core-tooldef`

Tool definitions over zsh-core; consumed by adapters (CLI, MCP, VS Code LM).

## Tooldef + adapters

Tool layer is shared; adapters stay thin. Mechanics in sibling `DEVELOPMENT.md`. Thin-adapter import allow-list as code: `src/test/adapter-matrix.ts` (+ sibling `.test.ts`).

Principle (root `AGENTS.md`, restated for proximity): tooldef consumes zsh-core; adapters consume tooldef. Do not add zsh-core query APIs just to support an adapter.

## Static, read-only, no-execution posture

A product feature. `src/test/scope.test.ts` walks `src/tools/` and rejects imports of:

- `child_process` (subprocess)
- network APIs
- `node:fs` (filesystem)
- `vscode`
- `process.env` reads

Same "no execution, no environment access" promise stated in MCP/CLI user-facing copy; loosen only deliberately.
