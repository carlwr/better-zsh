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

- `publish = false` → `publish = true`.
- Add fields: `authors`, `repository`, `homepage`, `keywords`, `categories`, `readme`, `rust-version` (MSRV — pin to the stable channel the CI validates against).
- `description` already present (`"Query the bundled static zsh reference from the command line."`); re-verify wording is still accurate on extraction day.

### Embedded JSON paths — largest single code change

`src/corpus.rs` hard-codes monorepo-relative paths in three places:

- `include_bytes!("../../packages/zsh-core-tooldef/dist/json/tooldef.json")` — line 15
- `include_bytes!("../../packages/zsh-core/dist/json/index.json")` — line 17
- `include_bytes!(concat!("../../packages/zsh-core/dist/json/", $file))` — inside the `include_category!` macro, line 27

At extraction these must become package-local relative paths (e.g. `data/tooldef.json`, `data/index.json`, `data/options.json`, …). Details + landing plan: see `DATA-SYNC.md`. Under the recommended option-6 hybrid, these paths are already routed through cfg-gated macros (`corpus_path!`, `tooldef_path!`) — extraction drops the `monorepo` arm and leaves the `vendored` arm in place.

### `include` / `exclude` in `Cargo.toml`

Add an `include` list covering at minimum:

```toml
include = [
  "src/**",
  "tests/**",
  "Cargo.toml",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "build.rs",
  "data/*.json",   # gitignored pre-extraction, committed post-extraction; see DATA-SYNC.md
]
```

### Makefile

- The repo root `Makefile` goes away. The `artifacts` target (which drives `pnpm build` for `zsh-core` and `zsh-core-tooldef`) moves to whatever cross-repo data-sync mechanism is chosen. → See `DATA-SYNC.md`.
- The extracted repo will have a simpler `Makefile` (or rely on cargo-native workflows) covering only the Rust side: `cli-debug`, `cli`, `cli-test`, `cli-check`, `cli-clean`.

### CI

- `.github/workflows/ci-rust.yml` is close-to-portable. Required changes at extraction:
  - Remove path filters referencing `packages/zsh-core/**`, `packages/zsh-core-tooldef/**`, and the root `Makefile`; narrow to `src/**`, `tests/**`, `Cargo.*`.
  - Remove `actions/setup-node`, `corepack enable`, `pnpm install` steps — unless the extracted repo vendored-JSON sync still drives a Node checkout.
  - Keep the `dtolnay/rust-toolchain`, cargo cache, fmt/clippy, and test steps unchanged.
  - Remove the untested-on-GitHub-hosted-runners caveat block once validated.

### Homebrew

- `Formula/zshref.rb` is already positioned for the default Homebrew tap scan (repo-root `Formula/`). At extraction, drop `Dir.chdir("zshref-rs")` from `def install` and switch to `--path "."`.
- `url` + `sha256` need replacing with the real GitHub Release source tarball (or a `bin.install "zshref"` PATH B once binaries are uploaded).
- Consider `brew audit --strict --online` as a CI gate at that point (macOS runner).

### Docs

- `README.md` — remove the `../` relative links to monorepo root `LICENSE` and `THIRD_PARTY_NOTICES.md` in the License section. Both files are committed in the extracted repo; use `./LICENSE` and `./THIRD_PARTY_NOTICES.md` (or bare filenames). Also update the "More" section so it no longer points at the monorepo as the canonical source.
- `DEVELOPMENT.md` — update the rebuild-rule table once the TS→Rust coupling changes (cross-repo data sync replaces the `pnpm --filter … build` steps). The `make artifacts` target description changes too.
- `THIRD_PARTY_NOTICES.md` — no changes.
- This file (`EXTRACTION.md`) — delete on the extraction commit.

### Cross-repo drift guards

- The `#[cfg(test)]` tests in `src/corpus.rs` compare hard-coded Rust constants against the canonical lists in the embedded `index.json`. They still work post-extraction as long as the vendored `index.json` ships with the crate. No change required.

### Scope fence

- N/A for Rust.

---

## Conventions while this file exists

- Keep entries short and actionable. Rationale belongs elsewhere.
- If a non-extraction commit already satisfies an item, cross it off here in the same commit.
