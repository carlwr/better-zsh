# npm distribution

Companion to `README.md` (rules for this dir, working rules, end state). Everything about this step lives here; the README section is a pointer.

_Status: executed; nothing published — the registry setup and the first real run are follow-ups._

The Rust binaries reach users without a Rust toolchain: prebuilt archives on the release tag and two npm packages, `@carlwr/zshref` (every platform's binaries, bins `zshref` + `zshref-mcp`) and `@carlwr/zshref-mcp` (`npx -y`-able, one bin over the fat package). Durable rationale: `zshref-rs/DISTRIBUTION.md`; this file records the step.

## Scope

- `zshref-rs/npm/`: `launch.js` (spawns the bundled binary; forwards argv, stdio, exit status, signals), `assemble.mjs` (archives → two staged packages; identity from `cargo metadata`), the two package READMEs
- `zshref-rs/scripts/`: `archive-bins` (one target's binaries → release archive; bash for the Windows runner), `mcp-probe` (one MCP session as sorted JSON), `npm-check` (the host gate)
- `Makefile`: `cli-npm-check`, `cli-release-act`; `scripts/test-integration-act` learns `ACT_WORKFLOW`
- `release-zshref.yml`: `check → build (×5) → release-assets → publish-npm → publish-crate`; `ci-rust.yml` gains `make cli-npm-check`
- `Cargo.toml`: `binstall` metadata; `include` globs anchored (§Decided during execution)
- `tests/msrv.rs`, `scripts/third-party-notices`: the five shipped triples (notices unchanged)
- Biome: `zshref-rs/npm` joins the root format/lint; `!zshref-rs` narrows to `data/` and `target/`
- docs: `DISTRIBUTION.md` (new), crate `README.md` (§Install, §MCP server), `DEVELOPMENT.md`, `AGENTS.md`, `EXTRACTION.md`; root `AGENTS.md` §Packaging, root `DEVELOPMENT.md` §act
- Rust source untouched

## Decisions

- _fat package:_ one npm package with every platform's binaries, not an `os`/`cpu` matrix of registry packages — ~2 MB gzipped per target; reversible later without a user-visible change
- _thin `@carlwr/zshref-mcp`:_ the name of the superseded TS alpha reused; exact-version dependency on the fat package
- _hand-rolled:_ cargo-dist rejected (postinstall-download npm installer, token-only publish, owns the workflow)
- _targets:_ darwin arm64 + x64, linux x64 + arm64 (gnu), windows x64; macOS x64 kept until its runner goes; no musl
- _release order:_ GitHub Release → npm → crates.io, reversibility descending; a re-run after a failed npm publish never reaches `cargo publish` twice
- _engines.node >= 18:_ the launcher's API surface is ancient and MCP clients bundle old Nodes; not tied to the repo's Node major
- _`npm i -g` of both packages collides on `zshref-mcp`:_ documented, not engineered around
- _Homebrew:_ untouched; stays an `EXTRACTION.md` item
- _registry setup:_ documented in `DISTRIBUTION.md`, not performed; the deprecation of the old TS alpha stays on the Deferred list (with the split)

### Decided during execution

- `Cargo.toml` `include` patterns are gitignore-style: unanchored `README.md` and `LICENSE` matched `npm/*/README.md` and a staged `.aux/npm/`; every pattern is now anchored with `/`. Found by the `.crate`-exclusion check in `npm-check`
- `exclude` is ignored once `include` is set — anchoring, not exclusion, is the fix
- the thin package's bin stub is generated like the fat ones (one template in `assemble.mjs`), so `npm/zshref-mcp/` holds only its README
- `archive-bins` smoke-runs every binary it packs (`--version`): the workflow has no separate smoke step and no second copy of the bin list
- `npm install` of both tarballs links `.bin/zshref-mcp` to the first package (the fat one), no error; `npm-check` probes the thin package's stub by path
- the act rehearsal maps `ubuntu-24.04-arm` onto the same image as `ubuntu-latest`; on Apple Silicon the arm64 Linux row is the one act builds natively
- `actions/upload-artifact` pinned at v5: act 0.2.89's artifact server rejects the v6 (`unauthorized`) and v7 (`mime_type`) upload protocols; `download-artifact@v8` works against it
- no x64 Node on the host: the launcher was exercised for `darwin-arm64` only; the `darwin-x64` binaries were run under Rosetta directly
- the OIDC-capable npm runs as `npx -y npm@latest publish …` instead of zsh-core's `npm i -g npm@latest`: the self-replacing upgrade dies with `MODULE_NOT_FOUND` under act's toolcache

## Captures

`.aux/mcp-rust/` (gitignored), the MCP-step instruments reused:

- `capture-cli before-npm` / `after-npm`: `zshref batch` over the pinned cases, `dump-help`, `schema`, `--version` — equal
- `capture-mcp before-npm` / `after-npm` (native `zshref-mcp`) / `after-npm-launcher` (via the installed `@carlwr/zshref-mcp` stub) — equal
- `npm pack --dry-run` of the two-platform fat package: 11 files, 4.5 MB packed, 15.2 MB unpacked

## Gates

Green at the commit:

```sh
pnpm format && pnpm qa
make cli-check && make cli-test && make cli-package && make cli-npm-check
(cd zshref-rs && cargo build --release --features mcp --target x86_64-apple-darwin)   # both bins run under Rosetta
(cd zshref-rs && for t in x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-pc-windows-msvc; do cargo check --release --features mcp --target $t; done)
make cli-release-act   # check → build (aarch64 Linux) → release-assets → publish-npm --dry-run → publish-crate --dry-run
scripts/list-maintainer-docs --quiet
```

Not run: the macOS and Windows matrix rows, OIDC, the release itself — first real tag.

## Follow-ups

- registry setup, then a dry `workflow_dispatch` on GitHub, then the first tag (`DISTRIBUTION.md` §npm registry setup)
- `fail-fast: false` on the build matrix: flip once the five rows have passed on a real run
- an x64 Node on a maintainer machine would let `npm-check` exercise the `darwin-x64` launcher path
- `release-zsh-core.yml` keeps the `npm i -g npm@latest` step; fine on GitHub, would fail under act — switch to the `npx` form if that workflow is ever rehearsed locally
