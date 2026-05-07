# AGENTS.md — `zshref` (Rust CLI)

Single-file Rust CLI; tool-surface mirror of the TS adapters.

## TS↔Rust mirror discipline

Per-symbol `// MIRRORED-IN:` (TS source) and `// MIRROR-OF:` (Rust source) markers pin the cross-language mirror pairs. Structural parity is enforced by `parity-units.ts` (rationale: `DESIGN.md`).

When renaming a mirrored symbol on either side: update both markers plus `parity-units.ts`.

## Iteration

- Rust-only edits: `cargo build` + `cargo test` (skip `pnpm qa`).
- From outside `zshref-rs/`: pass `--manifest-path zshref-rs/Cargo.toml`.
- Edits touching `packages/zsh-core-tooldef/` prose: rebuild tooldef first (`pnpm --filter @carlwr/zsh-core-tooldef build`), then `cargo build`.
