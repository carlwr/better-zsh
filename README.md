# better-zsh

> **Status: pre-release.** Alphas published from this repo exercise CI and packaging. The first non-alpha release has not yet been cut.

Improved zsh tooling, packaged as a set of focused libraries and adapters over a shared structured zsh reference.

## Packages

| Package | Purpose | Lives in | Distribution |
|---|---|---|---|
| [`@carlwr/zsh-core`](./packages/zsh-core) | Structured zsh reference: typed `DocCorpus`, closed `DocCategory` taxonomy, `resolve`/`renderDoc`, small analysis layer. Parsed from upstream zsh-5.9 Yodl source. | `packages/zsh-core/` | npm, JSR |
| [`@carlwr/zsh-core-tooldef`](./packages/zsh-core-tooldef) | Framework-neutral tool definitions over `zsh-core`: pure `(DocCorpus, input) → output` impls + shared `ToolDef` metadata. Consumed by every adapter. | `packages/zsh-core-tooldef/` | npm, JSR |
| [`@carlwr/zshref-mcp`](./packages/zshref-mcp) | Model Context Protocol server over stdio. Registers the shared tool surface for MCP-aware clients (Claude Desktop, Cursor, VS Code MCP, Zed, …). | `packages/zshref-mcp/` | npm, JSR |
| [`zshref`](./zshref-rs) | Single-binary Rust CLI over the same tool surface. Pipes JSON on stdout. Offline, statically linked, zero runtime dependencies. | `zshref-rs/` | crates.io, Homebrew (planned) |
| [`better-zsh`](./packages/vscode-better-zsh) | VS Code extension: hovers, completions, semantic tokens, diagnostics, Language Model tools. | `packages/vscode-better-zsh/` | VS Code Marketplace, Open VSX |

Pick the adapter that matches your runtime; they all wrap the same static corpus and the same pure tool implementations.

## Architecture in one paragraph

Two layers, three adapters. `zsh-core` (the knowledge layer) feeds `zsh-core-tooldef` (the single `ToolDef` surface: name, JSON-Schema input, brief + long description, pure `(corpus, input) → output` `execute`). Each adapter — MCP, CLI, VS Code — is thin transport glue that walks `toolDefs` uniformly. Drift guards at every joint: the extension's `contributes.languageModelTools` manifest must match `toolDefs` by a unit-test invariant, and the Rust CLI re-parses a JSON-exported `toolDefs` at build time and bakes it into the binary.

No shell execution, no subprocess, no network, no filesystem, no `process.env` reads in the tool layer — structurally enforced by a scope-fence test. This is a product feature, not just policy.

## Status and roadmap

- Pre-release alphas are cut from this monorepo for CI/infra exercise.
- The MCP server and CLI are planned for post-1.0 extraction into their own repos; the `zshref-rs/` Rust crate already builds standalone via a dual-mode `build.rs` (auto-detect monorepo source vs. vendored `data/`).
- A first non-alpha release bundle is planned; no date committed.

See [`RELEASE-HANDOFF.md`](./RELEASE-HANDOFF.md) for the release workflow and per-package publish auth.

## Contributing

Architectural rationale: [`DESIGN.md`](./DESIGN.md).
Contributor conventions, testing, packaging, code style: [`AGENTS.md`](./AGENTS.md).
CLI visual policy: [`CLI-VISUAL-POLICY.md`](./CLI-VISUAL-POLICY.md).
Security reporting: [`SECURITY.md`](./SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
