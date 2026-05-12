---
audience: maintainer
read-when: working in zshref-rs/
---

# AGENTS.md — `zshref` (Rust CLI)

Single-file Rust CLI; tool-surface mirror of the TS adapters.

## TS↔Rust mirror discipline

Per-symbol `// MIRRORED-IN:` (TS source) and `// MIRROR-OF:` (Rust source) markers pin the cross-language mirror pairs. Structural parity is enforced by `parity-units.ts` (rationale: `DESIGN.md`).

When renaming a mirrored symbol on either side: update both markers plus `parity-units.ts`.

## Iteration

- Rust-only edits: `cargo build` + `cargo test` (skip `pnpm qa`).
- From outside `zshref-rs/`: pass `--manifest-path zshref-rs/Cargo.toml`.
- Edits touching `packages/zsh-core-tooldef/` prose: rebuild tooldef first (`pnpm --filter @carlwr/zsh-core-tooldef build`), then `cargo build`.

## Tests

Property-based tests live in `tests/properties.rs` (proptest); deterministic invariant checks (CLI ↔ batch parity, every-category sweeps, full-corpus round-trip) live in `tests/cli_invariants.rs`. Shared helpers in `tests/common/mod.rs` (spawn-and-parse vocabulary, tooldef path resolution, `outputSchema` validators, subcommand→tool-name map). `run_json` auto-validates every tool subcommand response against its bundled `outputSchema` — new tests get conformance checks for free.

For plain integration tests (exit status, stdout shape) that don't need `outputSchema` validation, spawn the binary directly via `Command::new(env!("CARGO_BIN_EXE_zshref"))`.

## CLI / batch parity

`cli.rs` and `batch.rs` are independent entry points into `tools::dispatch`. Both inject `inputSchema.default` for omitted flags — CLI via `clap::Arg::default_value`, batch via `fill_defaults_from_schema`. Edit one, mirror the other. Parity is pinned by `omit_equals_schema_default` + `cli_equals_batch` in `tests/cli_invariants.rs`.

## Make targets

- Agents: use `pnpm cli`, `pnpm cli:test`, etc — wrapped via `quiet-run.mjs`, silent on success.
- Direct `make cli`: stays verbose; silencing would duplicate `quiet-run.mjs` buffering for no agent-path benefit.
