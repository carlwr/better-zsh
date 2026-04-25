# @carlwr/zsh-core-tooldef

> **Status: pre-release (alpha).** API surface is still free to move. Published on npm and JSR as part of the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo.

Framework-neutral tool definitions over [`@carlwr/zsh-core`](https://github.com/carlwr/better-zsh/tree/main/packages/zsh-core).

The tool layer: pure `(DocCorpus, input) → output` implementations plus shared `ToolDef` metadata (name, brief, long description, input JSON Schema, per-flag briefs). One record per tool; adapters walk `toolDefs` uniformly.

## What you get

- **`toolDefs`** — the aggregate list adapters iterate over.
- **`ToolDef`** — one metadata record per tool; see `src/tool-defs.ts` for the exact shape.
- **`makeToolDef`** — type-safe builder that compile-time-checks `flagBriefs` vs. schema properties and `required` vs. property keys.
- **Pure tool implementations** — `docs`, `search`, `list`. No IO, no subprocess, no network, no filesystem, no `process.env`, no `vscode`. Structurally enforced by `src/test/scope.test.ts`.

The package knows about `zsh-core` only. It has no knowledge of MCP, clap, or VS Code.

## Who consumes this

Three adapters today:

- [`@carlwr/zshref-mcp`](https://github.com/carlwr/better-zsh/tree/main/packages/zshref-mcp) — stdio MCP server.
- [`zshref`](https://github.com/carlwr/better-zsh/tree/main/zshref-rs) — Rust+clap CLI. Consumes the JSON-exported `tooldef.json` artifact baked into the binary at build time.
- [`better-zsh`](https://github.com/carlwr/better-zsh/tree/main/packages/vscode-better-zsh) — VS Code extension; registers the same tools as Language Model tools via `vscode.lm.registerTool`. A drift test asserts the extension manifest and `toolDefs` stay in one-to-one correspondence.

Three consumers is what justifies the extraction: at two, the shared layer is overhead; at three, collapsing per-adapter glue into a walk over `toolDefs` pays in both code and drift prevention (tool name, description, input schema live in exactly one place and every adapter picks them up automatically).

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

const corpus = await loadCorpus()

for (const td of toolDefs) {
  // td.name, td.brief, td.description, td.inputSchema, td.flagBriefs
  // td.execute(corpus, input) — pure; returns a JSON-serialisable object
}
```

Adapters plug `execute` into their transport of choice. The MCP server registers `name` + `inputSchema` + `execute` with `@modelcontextprotocol/sdk`; the Rust CLI materialises subcommands from the JSON-serialised `toolDefs` at build time; the VS Code adapter wires each one into `vscode.lm.registerTool`.

## Scope fence (product feature)

The "no execution, no environment access" posture advertised by the MCP and CLI is structurally enforced here: `src/test/scope.test.ts` walks `src/tools/` and rejects any import of `child_process`, network APIs, `node:fs`, `vscode`, or reads of `process.env`. Loosening the fence is a deliberate product decision, not a casual implementation change.

## See also

- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — adding a tool, tool-layer invariants, `brief` vs. `flagBriefs` vs. `description` asymmetry.
- [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) — architectural rationale for the tool layer and per-adapter consumer pattern.

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
