# AGENTS.md — `zshref` (Rust crate)

The `zshref` CLI and, behind the `mcp` feature, the `zshref-mcp` MCP server: one tool set, mirroring the TS tooldef. Semantic search is `zshref-web`'s (`packages/zshref-web/`); this crate has none.

## MSRV

One floor: `rust-version` in `Cargo.toml` — what `cargo install zshref` needs, features included; the comment beside it names the dependency that sets it. `tests/msrv.rs` guards it against the dependency graph resolved with every feature on; CI has no MSRV job.

## TS↔Rust mirror discipline

`// MIRRORED-IN:` (TS) ↔ `// MIRROR-OF:` (Rust) — zshref-rs ↔ pnpm-workspace TS code (`packages/zsh-core{,-tooldef}/`). Structural parity is enforced by `parity-units.ts` (rationale: `DESIGN.md`); the rename rule is root `AGENTS.md`'s. Resolver behaviour is pinned by zsh-core's conformance fixture (`DATA-SYNC.md`): a resolver change lands TS-side first, the fixture test then names every input the Rust side must follow.

## Iteration

- Rust-only edits: `cargo build --all-features` + `cargo test --all-features` (skip `pnpm qa`); without `--all-features` the MCP binary and its test are skipped.
- From outside `zshref-rs/`: pass `--manifest-path zshref-rs/Cargo.toml`.
- Edits touching `packages/zsh-core-tooldef/` prose: rebuild tooldef first (`pnpm --filter @carlwr/zsh-core-tooldef build`), then `cargo build`.

## Tests

- `tests/properties.rs` — property-based (proptest)
- `tests/cli_invariants.rs` — deterministic invariant checks: CLI ↔ batch parity, every-category sweeps, full-corpus round-trip
- `tests/mcp.rs` — black-box MCP client over the `zshref-mcp` binary: one stdio session per test; every successful `tools/call` validated against its `outputSchema`
- `tests/common/mod.rs` — shared helpers: spawn-and-parse vocabulary, tooldef path resolution, `outputSchema` validators, subcommand→tool-name map
- `src/resolver.rs` `#[cfg(test)]` — conformance to zsh-core's resolver fixture; `make cli-test` / `make cli-vendored-test` refresh fixture and corpus together, plain `cargo test` reads what is on disk

`run_json` auto-validates every tool subcommand response against its bundled `outputSchema` — new tests get conformance checks for free.

For plain integration tests (exit status, stdout shape) that don't need `outputSchema` validation, spawn the binary directly via `Command::new(env!("CARGO_BIN_EXE_zshref"))`.

## Entry points

`cli.rs` reaches `tools::dispatch` directly; `batch.rs` and the MCP server go through `tools::call`. Both paths inject `inputSchema.default` for omitted flags — CLI via `clap::Arg::default_value`, `call` via `tools::input`. Edit one, mirror the other. Parity is pinned by `omit_equals_schema_default` + `cli_equals_batch` in `tests/cli_invariants.rs` and `omitted_limit_takes_the_schema_default` in `tests/mcp.rs`.

## Make targets

- Agents: use `pnpm cli`, `pnpm cli:test`, etc — wrapped via `quiet-run.mjs`, silent on success.
- Direct `make cli`: stays verbose; silencing would duplicate `quiet-run.mjs` buffering for no agent-path benefit.

## `dump-help` script

Useful for:
- inspecting the `--help` output for top-level + all subcommands with a single command
- diffing complete `--help` output across changes

More info:
```sh
./zshref-rs/scripts/dump-help --help
```
