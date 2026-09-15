# AGENTS.md — `zshref` (Rust crate)

The `zshref` CLI and, behind the `mcp` feature, the `zshref-mcp` MCP server: one tool set, owned here (`src/tools.rs`). Semantic search is `zshref-web`'s (`packages/zshref-web/`); this crate has none.

## MSRV

One floor: `rust-version` in `Cargo.toml` — what `cargo install zshref` needs, features included; the comment beside it names the dependency that sets it. `tests/msrv.rs` guards it against the dependency graph resolved with every feature on; CI has no MSRV job.

## TS↔Rust mirror discipline

`// MIRRORED-IN:` (TS) ↔ `// MIRROR-OF:` (Rust) mark what this crate re-implements from `packages/zsh-core/` (resolvers, record-field projection): orientation only, no checker; the rename rule is root `AGENTS.md`'s. Resolver behaviour is pinned by zsh-core's conformance fixture (`DATA-SYNC.md`): a resolver change lands TS-side first, the fixture test then names every input the Rust side must follow.

Known divergence the fixture does not yet pin: `history_expn` caret shorthand with text after the final `^` (`^a^b^:G`, `^a^^`) — `history_key` answers `!!`, the TS regex nothing. `man zshexpn` sides with Rust (`^foo^bar^` is `!!:s^foo^bar^`; modifiers may follow): pin it, align TS.

## Iteration

- Rust-only edits: `cargo build --all-features` + `cargo test --all-features` (skip `pnpm qa`); without `--all-features` the MCP binary and its test are skipped.
- From outside `zshref-rs/`: pass `--manifest-path zshref-rs/Cargo.toml`.
- Edits touching `packages/zsh-core/`: the make targets (`DEVELOPMENT.md` §Rebuild rules) rebuild the artifacts first.

## Tests

- `tests/properties.rs` — property-based (proptest)
- `tests/cli_invariants.rs` — deterministic invariant checks: CLI ↔ batch parity, every-category sweeps, full-corpus round-trip
- `tests/mcp.rs` — black-box MCP client over the `zshref-mcp` binary: one stdio session per test; every successful `tools/call` validated against its `outputSchema`
- `tests/scope_fence.rs` — the tool layer names no process, network, environment or file-system facility
- `tests/common/mod.rs` — shared helpers: spawn-and-parse vocabulary, the tool set, `outputSchema` validators, subcommand→tool-name map
- `src/resolver.rs` `#[cfg(test)]` — conformance to zsh-core's resolver fixture; `make cli-test` / `make cli-vendored-test` refresh fixture and corpus together, plain `cargo test` reads what is on disk

`run_json` auto-validates every tool subcommand response against its `outputSchema` — new tests get conformance checks for free.

For plain integration tests (exit status, stdout shape) that don't need `outputSchema` validation, spawn the binary directly via `Command::new(env!("CARGO_BIN_EXE_zshref"))`.

## Entry points

- `src/tools/prose.rs` — tool prose, authored once and rendered into both targets (terminal `--help`, JSON tool surface); neither target is primary — see its module doc
- `src/cli/help.rs` — prose with no JSON counterpart (root help, non-tool subcommands) and the help-example renderer; hand-written prose, edit with care
- `Tool::call` — the request path of every adapter (`cli.rs`, `batch.rs`, the MCP server): one typed decode; omitted `limit` takes the `Input` default, mirrored in `inputSchema.default`. Pinned by `omit_equals_schema_default` + `cli_equals_batch` in `tests/cli_invariants.rs` and `omitted_limit_takes_the_schema_default` in `tests/mcp.rs`

## Make targets

- Agents: use `pnpm cli`, `pnpm cli:test`, etc — wrapped via `quiet-run.mjs`, silent on success.
- Direct `make cli`: stays verbose; silencing would duplicate `quiet-run.mjs` buffering for no agent-path benefit.

## Scripts

- `scripts/dump-help` — `--help` output for top-level + all subcommands in one file; for diffing across changes
- `scripts/third-party-notices` — regenerates `THIRD_PARTY_NOTICES.md` from `cargo tree`; run when `Cargo.lock` moves
- `scripts/probe-opencode` — manual agent-client probe of the built `zshref-mcp`
- `scripts/mcp-probe` — one MCP stdio session against any server command, as sorted JSON; for comparing launch paths
- `scripts/archive-bins` — packs one target's release binaries into the release archive; bash, the Windows runner runs it too
- `scripts/npm-check` — the host gate behind `make cli-npm-check`

## npm packaging

`npm/` — the launcher, the assembler and the package READMEs; not part of the `.crate`. Design and release mechanics: `DISTRIBUTION.md`. JS under `npm/` is formatted and linted by the root `pnpm format` / `pnpm lint`; the generated `bin/` stubs and `package.json` never enter the tree.
