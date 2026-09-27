---
audience: maintainer
read-when: extraction-day checklist for zshref (Rust crate)
---

# Extraction checklist

The day `zshref` (this crate) leaves the `better-zsh` monorepo for its own repo, `zshref`. A checklist, not a spec: add items as noticed; an item a non-extraction commit satisfies is crossed off in that commit. Deleted on the extraction commit. The vendoring shape it lands on: `DATA-SYNC.md`.

## Crate

- `Cargo.toml`: `repository` / `homepage` → the extracted repo URL; re-verify the rest of the crates.io metadata
  - the npm packages and the `binstall` `pkg-url` follow: `npm/assemble.mjs` reads the manifest
- `build.rs`: drop the `monorepo` arm — vendored becomes the only data source
- failure hints naming root make targets (`build.rs`, the resolver conformance test): follow the crate `Makefile`
- `MIRROR-OF` markers name `packages/zsh-core/` paths: qualify them with the `better-zsh` repo
- `project_url!` (`src/lib.rs`): the URL the binaries print; a repo name other than `zshref` changes it and every `rg -F github.com/carlwr/zshref` hit
- `data/`: stays gitignored (generated, never committed); `make vendor` populates it
- `scripts/third-party-notices`: take the zsh licence from the vendored tarball's `THIRD_PARTY_NOTICES.md`

## Build and CI

- `Makefile`: crate-local, Rust-side targets only
  - `artifacts` goes: no TS build to drive
  - `vendor`: download zsh-core's two release assets at a pinned tag and check their `.sha256`, instead of copying the sibling's `artifacts/`
    - prerequisite: a zsh-core GitHub release carrying them — `zsh-core-v*` tags exist, releases do not yet
  - `cli-release-act` drives the root `scripts/test-integration-act`: copy it or drop the target
- `ci-rust.yml`: drop the `packages/zsh-core/**` and `Makefile` path filters and the `setup-node-pnpm` step (the composite action stays behind)
- `release-zshref.yml`: the same edits — except `publish-npm` still needs Node: `actions/setup-node` replaces the composite action; re-point Trusted Publishing at the new repo before releasing from it — crates.io, and npm for both packages (`DISTRIBUTION.md`)
- both workflows: drop the `zshref-rs/` path prefixes, `working-directory` and rust-cache `workspaces`
- `.github/dependabot.yml`: the `cargo` entry moves out, pointed at `/`
- root `package.json`: `format:root` / `lint:root` drop `zshref-rs/npm`; the crate repo needs its own Biome config for `npm/`
- Homebrew — `Formula/zshref.rb` already sits at the default tap scan path and pulls the crates.io `.crate`:
  - `head` → the new repo; until then `--HEAD` is broken (the monorepo root has no `Cargo.toml`)
  - decide whether it builds with `--features mcp`
  - consider `brew audit --strict --online` as a CI gate

## Docs

- `README.md`:
  - install: `cargo install zshref` (`--features mcp` for both binaries) instead of monorepo checkout + `make cli`
  - drop the pre-release banner and the "planned" caveats
- `DEVELOPMENT.md`:
  - drop the pre-release note
  - rebuild rules: `make vendor` instead of the artifact-building targets
  - drop the `zshref-rs/` path prefixes
- `AGENTS.md`, `DATA-SYNC.md`, `DISTRIBUTION.md`: re-point monorepo references
  - the repo-root `Makefile`, `pnpm cli*`, `packages/zsh-core/`
  - root docs that stay behind, among `rg -oI '\b[A-Z-]+\.md\b' zshref-rs/*.md | sort -u`
  - `DISTRIBUTION.md`'s `gh attestation verify --repo`: releases cut before extraction stay attested to `better-zsh`
- this file: deleted

## Monorepo side

`rg zshref-rs` outside `zshref-rs/` lists every site; each is re-judged, most go. The `MIRRORED-IN` markers in zsh-core re-point to the new repo.

Missed by that query — the make-target wrappers:

- `scripts/build/build-tasks.mjs`: the `cli*` tasks; `pnpm cli:qa` in `qa`
- root `package.json`: the `cli*` scripts

## Open until then

- whether a thin `zshref-mcp` repo is wanted beside `zshref`
- names: this monorepo's after the split, and its packages'
- tag prefix: keep `zshref-v*` or move to `v*` — both workflows, the `binstall` `pkg-url` and `DISTRIBUTION.md` follow
- sync trigger: a manual PR bumping the pinned zsh-core tag, or a scheduled job on the Rust repo that polls for a new tag and opens the PR
- one pinned data version, not a range; the crate releases when the pin bumps, not on zsh-core's cadence
- size: ~1 MB embedded is fine; past ~5 MB, compress at build time or split a data-only crate
