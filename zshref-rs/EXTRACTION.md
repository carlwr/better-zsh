---
audience: maintainer
read-when: extraction-day checklist for zshref (Rust CLI)
---

# Extraction checklist

> **Scope and lifetime.** Working checklist for the day
> `zshref` (this crate) leaves the `better-zsh` monorepo for its own repo.
> Keep it local; delete it on the extraction commit or move it to private notes.
>
> Nothing here is a promise or a spec. Add items as you notice them; cross them off as they land.

---

## Items that become actionable at extraction time

### Lockfile / toolchain

- `Cargo.lock` — committed (correct for a binary crate). Carry it over as-is.

### `Cargo.toml` edits

- `repository` / `homepage`: currently `https://github.com/carlwr/better-zsh`; update to the extracted repo URL (e.g. `https://github.com/carlwr/zshref`).
- `publish`, `authors`, `keywords`, `categories`, `readme`, `rust-version`, `description`, `include` — already filled; re-verify wording is still accurate on extraction day.

### Embedded JSON paths

Already routed through cfg-gated macros (`corpus_path!`, `tooldef_path!` in `src/corpus.rs`) by the option-6 dual-mode build. At extraction:

- Drop the `monorepo` arm from the macros in `src/corpus.rs` and the corresponding branch in `build.rs`.
- Remove `/data/` from `.gitignore` and commit the vendored JSONs.

See `DATA-SYNC.md` for the landed design.

### `include` / `exclude` in `Cargo.toml`

Already filled (see `Cargo.toml`). `data/*.json` is gitignored pre-extraction
and enters the `.crate` via cargo's `include` override; post-extraction the
directory is committed. See `DATA-SYNC.md`.

### Makefile

- The repo root `Makefile` goes away. The `artifacts` target (which drives `pnpm build` for the TS packages) moves to whatever cross-repo data-sync mechanism is chosen; the monorepo-only CI job disappears alongside it.
- The vendor target pivots: instead of copying from a sibling package, it clones the TS repo at a pinned commit (`DATA_COMMIT` file or similar) and runs its build, then copies.
- The extracted repo will have a simpler `Makefile` (or rely on cargo-native workflows) covering only the Rust side: `cli-debug`, `cli`, `cli-test`, `cli-check`, `cli-clean`.

### CI

- `.github/workflows/ci-rust.yml` is close-to-portable. Required changes at extraction:
  - Remove path filters referencing `packages/zsh-core/**`, `packages/zsh-core-tooldef/**`, and the root `Makefile`; narrow to `src/**`, `tests/**`, `Cargo.*`.
  - Remove the `setup-node-pnpm` step — the composite action it names stays behind in the monorepo — unless the extracted repo vendored-JSON sync still drives a Node checkout.
  - Keep the `dtolnay/rust-toolchain`, cargo cache, fmt/clippy, test, and `cli-vendored-test` + `cli-package` steps unchanged.

### NLP QA harness (Node)

`tests/nlp-qa/run-qa.mjs` imports `yaml`, resolved today from the monorepo-root `node_modules`; the standalone crate ships no `package.json` providing it. Either add a dev-only `package.json` (`yaml` dep) to the extracted repo, or author the QA corpus as JSON to drop the dep.

### Homebrew

- `Formula/zshref.rb` is already positioned for the default Homebrew tap scan (repo-root `Formula/`) and already pulls from the crates.io-published `.crate`. On each new release, bump `url` + `sha256` to the new version's tarball. No structural changes needed at extraction.
- Consider `brew audit --strict --online` as a CI gate at that point (macOS runner).

### Docs

Companion-repo URLs and the project name are already in post-extraction form. Remaining extraction-day items:

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

- No extraction-day action. The TS↔Rust drift guards described in `DATA-SYNC.md` survive unchanged as long as the vendored `index.json` ships with the crate.

### Scope fence

- N/A for Rust.

---

## Open questions (decide on extraction day)

- **Sync trigger discipline.** When TS data changes upstream, how does the Rust repo learn? Options: (a) manual PR bumping `DATA_COMMIT`; (b) a scheduled action on the Rust repo that polls the TS repo and opens a PR if data changed (the classic "dependabot for vendored data" pattern).
- **One data version, or a range?** Simplest: one. `DATA_COMMIT` (or `DATA_VERSION` once TS gets tags) is a pin; the Rust repo releases when the pin bumps, not on TS's cadence.
- **Size budget.** The current ~1 MB is fine baked into a binary. If the corpus grows past ~5 MB, reconsider — either compress at build time (`zstd`/`brotli`, decompress at load) or split into a data-only crate.

---

## Conventions while this file exists

- Keep entries short and actionable. Rationale belongs elsewhere.
- If a non-extraction commit already satisfies an item, cross it off here in the same commit.
