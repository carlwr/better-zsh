---
audience: maintainer
read-when: extraction-day checklist for zshref (Rust crate)
---

# Extraction checklist

The day `zshref` (this crate) leaves the `zsh-lexicon` monorepo for its own repo, `zshref`. A checklist, not a spec: add items as noticed; an item a non-extraction commit satisfies is crossed off in that commit. Deleted on the extraction commit. The vendoring shape it lands on: `DATA-SYNC.md`.

## Crate

- `Cargo.toml`: `repository` / `homepage` → the extracted repo URL; re-verify the rest of the crates.io metadata
  - the npm packages and the `binstall` `pkg-url` follow: `npm/assemble.mjs` reads the manifest
  - npm provenance rejects a `repository` other than the publishing repo: this move and the first release from the new repo land together
- `build.rs`: drop the `monorepo` arm — vendored becomes the only data source
  - `ZSHREF_DATA_SOURCE` loses its purpose: drop it, or keep `vendored` as its one value; setters: `rg ZSHREF_DATA_SOURCE` outside `*.md`
- failure hints naming root make targets (`` rg -F '`make ' build.rs src scripts ``): follow the crate `Makefile`
- `MIRROR-OF` markers name `packages/zsh-lexicon/` paths: qualify them with the `zsh-lexicon` repo
- `project_url!` (`src/lib.rs`): the URL the binaries print; a repo name other than `zshref` changes it and every `rg -F github.com/carlwr/zshref` hit
- `data/`: stays gitignored (generated, never committed); `make vendor` populates it

## Build and CI

- `Makefile`: crate-local, Rust-side targets only
  - `artifacts` goes: no TS build to drive
  - `vendor`: swap the local `pack:release` and its output dir for `gh release download <pinned tag>`; checksum check and unpack stay
    - prerequisite: a zsh-lexicon GitHub release carrying them — none yet
    - `.sha256` proves integrity only; provenance: `gh attestation verify` against `zsh-lexicon`, whose release workflow attests the tarballs
    - CI jobs that vendor set `GH_TOKEN`: `gh` refuses to run unauthenticated in Actions
  - `cli-release-act` drives the root `scripts/test-integration-act`: copy it or drop the target
- `ci-rust.yml`: the `paths` filters go — the whole repo is the crate; `actions/setup-node` replaces the `setup-node-pnpm` step (the composite action stays behind; `make cli-npm-check` still needs Node)
- `release-zshref.yml`: `check` drops `setup-node-pnpm`; `publish-npm` swaps it for `actions/setup-node`; before releasing from the new repo, re-point Trusted Publishing (repo; workflow filename if renamed): crates.io, and npm for both packages (`DISTRIBUTION.md`)
- both workflows: drop the `zshref-rs/` path prefixes, `working-directory` and rust-cache `workspaces`
- `.github/dependabot.yml`: the `cargo` entry moves out, pointed at `/`; the new repo needs its own `github-actions` entry
  - copy the `actions/upload-artifact` major-version ignore: release workflows on both sides rehearse under act
- root `.gitattributes` and `.editorconfig`: the crate inherits both; copy them
- root `.gitignore`: the crate's own lists build trees only; carry over the repo-generic entries
- root `package.json`: `format:root` / `lint:root` drop `zshref-rs/npm`; the crate repo needs its own Biome config for `npm/`
- Homebrew — `Formula/zshref.rb` already sits at the default tap scan path and pulls the crates.io `.crate`:
  - `homepage`, `head` → the new repo; until then `--HEAD` is broken (the monorepo root has no `Cargo.toml`)
  - decide whether it builds with `--features mcp`
  - consider `brew audit --strict --online` as a CI gate

## Docs

- `README.md`:
  - install: `cargo install zshref` (`--features mcp` for both binaries) instead of monorepo checkout + `make cli`
  - drop the pre-release banner and the "planned" caveats
- `npm/*/README.md`: drop the pre-release banner naming the monorepo
- `DEVELOPMENT.md`:
  - drop the monorepo-phase intro line
  - data-source paragraph: vendored only
  - rebuild rules: `make vendor` instead of the artifact-building targets
  - drop the `zshref-rs/` path prefixes
- `AGENTS.md`, `DATA-SYNC.md`, `DISTRIBUTION.md`: re-point monorepo references
  - the repo-root `Makefile`, `pnpm cli*`, `packages/zsh-lexicon/`
  - root docs that stay behind, among `rg -oI '\b[A-Z-]+\.md\b' zshref-rs/*.md zshref-rs/src zshref-rs/tests | sort -u`
  - `DISTRIBUTION.md`'s `gh attestation verify --repo`: releases cut before extraction stay attested to `zsh-lexicon`
- monorepo-root conventions: `AGENTS.md` adopts or drops each; their lint scripts stay behind
  - maintainer-doc frontmatter
  - `CLAUDE.md` → `AGENTS.md` symlink
  - commit rules
  - md style
  - code rules: no `DocCategory` enumeration; mirror renames
- this file: deleted

## Monorepo side

`rg zshref-rs` outside `zshref-rs/` lists every site; each is re-judged, most go. The `MIRRORED-IN` markers in zsh-lexicon re-point to the new repo.

Missed by that query — the make-target wrappers:

- `scripts/build/build-tasks.mjs`: the `cli*` tasks; `pnpm cli:qa` in `qa`
- root `package.json`: the `cli*` scripts

## Open until then

- whether a thin `zshref-mcp` repo is wanted beside `zshref`
- root `skills/cli-ux-probe/`: CLI-agnostic, but this crate is its only target — moves with it (plus its per-tool links), stays, or gets its own repo
- history: carried over (`git filter-repo --subdirectory-filter zshref-rs`; prune tags to `zshref-v*`) or a fresh start
- names: `REPO-SHAPE.md`
- tag prefix: keep `zshref-v*` or move to `v*` — both workflows, the `binstall` `pkg-url` and `DISTRIBUTION.md` follow
- sync trigger: a manual PR bumping the pinned zsh-lexicon tag, or a scheduled job on the Rust repo that polls for a new tag and opens the PR
- one pinned data version, not a range; the crate releases when the pin bumps, not on zsh-lexicon's cadence
- size: ~1.6 MB embedded is fine; past ~5 MB, compress at build time or split a data-only crate
