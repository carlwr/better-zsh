# Extraction checklist

> **Scope and lifetime.** Working checklist for the day
> `zshref` (this crate) leaves the `better-zsh` monorepo for its own repo.
> Keep it local; delete it on the extraction commit or move it to private notes.
>
> Nothing here is a promise or a spec. Add items as you notice them; cross them off as they land.

---

## Items that become actionable at extraction time

### Lockfile / toolchain

- `Cargo.lock` — committed (correct for a binary crate). No change needed; carry it over as-is.

### `Cargo.toml` edits

- `repository` / `homepage`: currently `https://github.com/carlwr/better-zsh`; update to the extracted repo URL (e.g. `https://github.com/carlwr/zshref`).
- `publish`, `authors`, `keywords`, `categories`, `readme`, `rust-version`, `description`, `include` — already filled; re-verify wording is still accurate on extraction day.

### Embedded JSON paths

Already routed through cfg-gated macros (`corpus_path!`, `tooldef_path!` in `src/corpus.rs`) by the option-6 dual-mode build. At extraction, drop the `monorepo` arm from the macros and from `build.rs`, leaving only the `vendored` arm. See `DATA-SYNC.md` for the landed design.

### `include` / `exclude` in `Cargo.toml`

Already filled (see `Cargo.toml`). `data/*.json` is gitignored pre-extraction
and enters the `.crate` via cargo's `include` override; post-extraction the
directory is committed. See `DATA-SYNC.md`.

### Makefile

- The repo root `Makefile` goes away. The `artifacts` target (which drives `pnpm build` for `zsh-core` and `zsh-core-tooldef`) moves to whatever cross-repo data-sync mechanism is chosen. → See `DATA-SYNC.md`.
- The extracted repo will have a simpler `Makefile` (or rely on cargo-native workflows) covering only the Rust side: `cli-debug`, `cli`, `cli-test`, `cli-check`, `cli-clean`.

### CI

- `.github/workflows/ci-rust.yml` is close-to-portable. Required changes at extraction:
  - Remove path filters referencing `packages/zsh-core/**`, `packages/zsh-core-tooldef/**`, and the root `Makefile`; narrow to `src/**`, `tests/**`, `Cargo.*`.
  - Remove `actions/setup-node`, `corepack enable`, `pnpm install` steps — unless the extracted repo vendored-JSON sync still drives a Node checkout.
  - Keep the `dtolnay/rust-toolchain`, cargo cache, fmt/clippy, test, and `cli-vendored-test` + `cli-package` steps unchanged.

### Homebrew

- `Formula/zshref.rb` is already positioned for the default Homebrew tap scan (repo-root `Formula/`) and already pulls from the crates.io-published `.crate`. On each new release, bump `url` + `sha256` to the new version's tarball. No structural changes needed at extraction.
- Consider `brew audit --strict --online` as a CI gate at that point (macOS runner).

### Docs

Companion-repo URLs and the project name are already post-extraction form (AGENTS.md §"Post-extraction repo URLs in user-facing docs"). Remaining extraction-day items:

- `README.md`:
  - `../LICENSE` / `../THIRD_PARTY_NOTICES.md` → `./LICENSE` / `./THIRD_PARTY_NOTICES.md`.
  - Install: swap monorepo-checkout + `make cli` for `cargo install zshref`.
  - Remove pre-release status banner and "planned for first stable release" caveats.
- `DEVELOPMENT.md`:
  - Remove the "Note: pre-release, monorepo" section.
  - Rebuild-rule table: TS→Rust coupling shifts from `pnpm --filter … build` to cross-repo data-sync; `make artifacts` description too.
  - Drop `zshref-rs/` prefixes from paths in fast-dev-loop and testing sections.
- `THIRD_PARTY_NOTICES.md` — no changes.
- This file — delete on the extraction commit.

### Cross-repo drift guards

- The `#[cfg(test)]` tests in `src/corpus.rs` compare hard-coded Rust constants against the canonical lists in the embedded `index.json`. They still work post-extraction as long as the vendored `index.json` ships with the crate. No change required.

### Scope fence

- N/A for Rust.

---

## Conventions while this file exists

- Keep entries short and actionable. Rationale belongs elsewhere.
- If a non-extraction commit already satisfies an item, cross it off here in the same commit.
