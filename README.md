# better-zsh

> **Status: pre-release.** Alphas published from this repo exercise CI and packaging. The first non-alpha release has not yet been cut.

Improved zsh tooling, packaged as a set of focused libraries and adapters over a shared structured zsh reference.

## Packages

| Package | Purpose | Lives in | Distribution |
|---|---|---|---|
| `@carlwr/zsh-core` | Structured zsh reference: typed `DocCorpus`, closed `DocCategory` taxonomy, `resolve`/`renderDoc`, small analysis layer. Parsed from upstream zsh-5.9 Yodl source. | `packages/zsh-core/` | npm, JSR |
| `zshref` | Rust crate: the single-file executable `zshref` CLI (JSON on stdout) and the `zshref-mcp` Model Context Protocol server over stdio for MCP-aware clients (Claude Code, Claude Desktop, Cursor, VS Code MCP, Zed, …). Offline; no Node, Python, or zsh runtime dependency. | `zshref-rs/` | crates.io, Homebrew (planned) |
| `better-zsh` | VS Code extension: hovers, completions, semantic tokens, diagnostics. | `packages/vscode-better-zsh/` | VS Code Marketplace, Open VSX |
| `zshref-web` | Browser SPA: local semantic search over the same reference — embeddings computed in the browser; index built from `zsh-core` at build time. | `packages/zshref-web/` | static site (deploy planned) |

Pick the adapter that matches your runtime; all wrap the same static corpus.

## Architecture in one paragraph

Two layers, two adapters. `zsh-core` (the knowledge layer) emits the reference as JSON; the Rust crate bakes it into the binaries at build time and owns the tool set (`zsh_docs`, `zsh_search`, `zsh_list`: name, JSON-Schema input and output, brief + long description, pure `(corpus, input) → output` implementation). Each adapter — CLI, MCP — is thin transport glue over those definitions. The VS Code extension and the web SPA consume `zsh-core` directly — the extension for its editor features, the SPA at build time for its search index.

No shell execution, no subprocess, no network, no filesystem, no environment reads in the tool layer — structurally enforced by a scope-fence test. This is a product feature, not just policy.

## Status and roadmap

- Pre-release alphas are cut from this monorepo for CI/infra exercise.
- The Rust crate is planned for post-1.0 extraction into its own repo; `zshref-rs/` already builds standalone via a dual-mode `build.rs` (auto-detect monorepo source vs. vendored `data/`).
- A first non-alpha release bundle is planned; no date committed.

## Contributing

- `DESIGN.md` — architectural rationale
- `AGENTS.md` — contributor conventions, testing, packaging, code style
- `SECURITY.md` — security reporting

## License

MIT. See `LICENSE`. Upstream zsh documentation notices: `THIRD_PARTY_NOTICES.md`.
