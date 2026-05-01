# AGENTS.md — `zshref` (Rust CLI)

Single-file Rust CLI; tool-surface mirror of the TS adapters.

## TS↔Rust mirror discipline

Per-symbol `// MIRRORED-IN:` (TS source) and `// MIRROR-OF:` (Rust source) markers pin the cross-language mirror pairs. Structural parity is enforced by `parity-units.ts` (rationale: `DESIGN.md`).

When renaming a mirrored symbol on either side: update both markers plus `parity-units.ts`.
