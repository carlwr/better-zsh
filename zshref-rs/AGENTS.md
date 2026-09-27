# AGENTS.md — `zshref` (Rust crate)

The `zshref` CLI and, behind the `mcp` feature, the `zshref-mcp` MCP server: one tool set, owned here (`src/tools.rs`). Semantic search is `zshref-web`'s (`packages/zshref-web/`); this crate has none.

## Repo URL

`github.com/carlwr/zshref` (`project_url!`, `src/lib.rs`) is the settled post-extraction repo; links to it stay dead until extraction, by design.

## MSRV

One floor: `rust-version` in `Cargo.toml` — what `cargo install zshref` needs, features included; the comment beside it names the dependency that sets it. Guard: `tests/msrv.rs`.

## TS↔Rust mirror discipline

`// MIRRORED-IN:` (TS) ↔ `// MIRROR-OF:` (Rust) mark what this crate re-implements from `packages/zsh-core/` (resolvers, record-field projection): orientation only, no checker; rename rule: root `AGENTS.md`. A resolver change lands TS-side first; the conformance fixture (`DATA-SYNC.md`) then names every input the Rust side must follow.

Known divergence the fixture does not yet pin: `history_expn` caret shorthand with text after the final `^` (`^a^b^:G`, `^a^^`) — `history_key` answers `!!`, the TS regex nothing. `man zshexpn` sides with Rust (`^foo^bar^` is `!!:s^foo^bar^`; modifiers may follow): pin it, align TS.

## Iteration

- Rust-only edits: `cargo build --all-features` + `cargo test --all-features` (skip `pnpm qa`); without `--all-features` the MCP binary and its test are skipped.
- From outside `zshref-rs/`: pass `--manifest-path zshref-rs/Cargo.toml`.
- Edits touching `packages/zsh-core/`: the make targets (`DEVELOPMENT.md` §Rebuild rules) rebuild the artifacts first.

## Tests

- `tests/` — each file's module doc says what it pins
- `run_json` (`tests/common/`) validates every tool-subcommand response against its `outputSchema` — new tests get conformance checks for free
- plain integration tests (exit status, stdout shape) that need no `outputSchema` validation spawn the binary directly: `Command::new(env!("CARGO_BIN_EXE_zshref"))`
- `src/resolver.rs` `#[cfg(test)]` — conformance to zsh-core's resolver fixture; the make test targets refresh fixture and corpus together, plain `cargo test` reads what is on disk

## Entry points

- `src/tools/prose.rs` — tool prose, one source for `--help` and the JSON tool surface; see its module doc
- `src/cli/help.rs` — hand-written `--help` prose with no JSON counterpart; edit with care
- `Tool::call` — the request path of every adapter (`cli.rs`, `batch.rs`, the MCP server): one typed decode; omitted `limit` takes the `Input` default, mirrored in `inputSchema.default`

## Make targets

- Agents: use `pnpm cli`, `pnpm cli:test`, etc — wrapped via `quiet-run.mjs`, silent on success.
- Direct `make cli`: stays verbose; silencing would duplicate `quiet-run.mjs` buffering for no agent-path benefit.

## Scripts

`scripts/` — each script's header or `--help` says what it does and when to run it.

## npm packaging

`npm/` — not part of the `.crate`. Design and release mechanics: `DISTRIBUTION.md`. Formatted and linted by the root `pnpm format` / `pnpm lint`; the generated `bin/` stubs and `package.json` never enter the tree.
