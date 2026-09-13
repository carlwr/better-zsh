---
audience: maintainer
read-when: extraction-day checklist for zshref (Rust crate)
---

# Extraction checklist

The day `zshref` (this crate) leaves the `better-zsh` monorepo for its own repo, `zshref`. A checklist, not a spec: add items as noticed; an item a non-extraction commit satisfies is crossed off in that commit. Deleted on the extraction commit. The vendoring shape it lands on: `DATA-SYNC.md`.

## Crate

- `Cargo.toml`: `repository` / `homepage` → the extracted repo URL; re-verify the rest of the crates.io metadata
- `build.rs` + `src/corpus.rs`: drop the `monorepo` arm — vendored becomes the only data source
- `data/`: stays gitignored (generated, never committed); `make vendor` populates it

## Build and CI

- `Makefile`: crate-local, Rust-side targets only
  - `artifacts` goes: no TS build to drive
  - `vendor`: download zsh-core's two release assets at a pinned tag and check their `.sha256`, instead of copying the sibling's `artifacts/`
- `ci-rust.yml`: drop the `packages/zsh-core/**` and `Makefile` path filters and the `setup-node-pnpm` step (the composite action stays behind)
- `release-zshref.yml`: the same edits; re-point crates.io Trusted Publishing at the new repo before releasing from it
- Homebrew — `Formula/zshref.rb` already sits at the default tap scan path and pulls the crates.io `.crate`:
  - decide whether it builds with `--features mcp`
  - consider `brew audit --strict --online` as a CI gate

## Docs

- `README.md`:
  - `../THIRD_PARTY_NOTICES.md` → `./THIRD_PARTY_NOTICES.md`
  - install: `cargo install zshref` (`--features mcp` for both binaries) instead of monorepo checkout + `make cli`
  - drop the pre-release banner and the "planned" caveats
- `DEVELOPMENT.md`:
  - drop the pre-release note
  - rebuild rules: `make vendor` instead of `pnpm --filter … build`
  - drop the `zshref-rs/` path prefixes
- this file: deleted

## Monorepo side

`rg zshref-rs` outside `zshref-rs/` lists every site; each is re-judged, most go. The `MIRRORED-IN` markers in zsh-core re-point to the new repo.

## Open until then

- sync trigger: a manual PR bumping the pinned zsh-core tag, or a scheduled job on the Rust repo that polls for a new tag and opens the PR
- one pinned data version, not a range; the crate releases when the pin bumps, not on zsh-core's cadence
- size: ~1 MB embedded is fine; past ~5 MB, compress at build time or split a data-only crate
