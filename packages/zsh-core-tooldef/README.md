# @carlwr/zsh-core-tooldef

> **Status: pre-release (alpha).** API surface is still free to move. Published on npm and JSR as part of the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo.

Framework-neutral tool definitions over [`@carlwr/zsh-core`](https://github.com/carlwr/better-zsh/tree/main/packages/zsh-core).

The tool layer: pure `(DocCorpus, input) → output` implementations plus shared `ToolDef` metadata (name, brief, long description, input JSON Schema, output JSON Schema, per-flag briefs). One record per tool; adapters walk `toolDefs` uniformly.

## What you get

- **`toolDefs`** — the aggregate list adapters iterate over.
- **`ToolDef`** — one metadata record per tool; see `src/tool-defs.ts` for the exact shape.
- **`buildToolDef`** — type-safe builder composing prose and schema shape; compile-time-checks per-flag prose keys, schema properties, and `required` against one shared key union.
- **Pure tool implementations** — `docs`, `search`, `list`. No IO, no subprocess, no network, no filesystem, no `process.env`, no `vscode`. Structurally enforced by `src/test/scope.test.ts`.

The package knows about `zsh-core` only.

## Who consumes this

- [`zshref`](https://github.com/carlwr/zshref) — the `zshref` CLI and the `zshref-mcp` MCP server, in Rust. Both consume the JSON-exported `tooldef.json` artifact baked into the binaries at build time.

Per-adapter glue collapses into a walk over `toolDefs`: tool name, description, input schema, and output schema live in exactly one place and every adapter picks them up automatically.

## Install

```sh
npm install @carlwr/zsh-core-tooldef
# or
pnpm add @carlwr/zsh-core-tooldef
```

`@carlwr/zsh-core` comes in as a transitive runtime dependency.

## Minimal usage (adapter-side)

```ts
import { loadCorpus } from "@carlwr/zsh-core"
import { toolDefs } from "@carlwr/zsh-core-tooldef"

const corpus = loadCorpus()

for (const td of toolDefs) {
  // td.name, td.brief, td.description, td.inputSchema, td.outputSchema, td.flagBriefs
  // td.execute(corpus, input) — pure; returns a JSON-serialisable object
}
```

Adapters plug `execute` into their transport of choice. The Rust binaries embed the JSON-serialised `toolDefs` at build time; the CLI materialises its subcommands from it and the MCP server its `tools/list`, each exposing `outputSchema` (`zshref schema`, `tools/list`).

## Scope fence (product feature)

The "no execution, no environment access" posture advertised by the MCP and CLI is structurally enforced here: `src/test/scope.test.ts` walks `src/tools/` and rejects any import of `child_process`, network APIs, `node:fs`, `vscode`, or reads of `process.env`. Loosening the fence is a deliberate product decision, not a casual implementation change.

## See also

- `DEVELOPMENT.md` — adding a tool, tool-layer invariants, `brief` vs. `flagBriefs` vs. `description` asymmetry.
- [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) — architectural rationale for the tool layer and per-adapter consumer pattern.

## License

MIT. See `LICENSE`. Upstream zsh documentation notices: `THIRD_PARTY_NOTICES.md`.
