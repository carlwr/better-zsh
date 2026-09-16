---
audience: maintainer
read-when: releasing the crate, or changing how its binaries are distributed
---

# Distribution

How the `zshref` binaries reach users, and why in that shape. Mechanics: `.github/workflows/release-zshref.yml`, `npm/assemble.mjs`, `scripts/`.

## Channels

One tag, `zshref-v<version>`, feeds every channel.

- crates.io — the source crate; `cargo install zshref --features mcp`
- GitHub Release archives — one per target, both binaries plus license files, `SHA256SUMS`, build-provenance attestation; `cargo binstall zshref` reads them (`[package.metadata.binstall]` in `Cargo.toml`)
- npm `@carlwr/zshref` — every target's binaries in one package, a launcher per bin (`npm/launch.js`); bins `zshref`, `zshref-mcp`
- npm `@carlwr/zshref-mcp` — bin `zshref-mcp` over an exact-version dependency on the fat package; the `npx -y` form MCP clients want

Targets: the workflow's build matrix. The same list sits in `tests/msrv.rs` and `scripts/third-party-notices` — three languages, no practical single source; a target change touches all three. macOS x64 stays while it costs nothing (cross-built on the arm64 runner; ~26 % of macOS Homebrew installs at the time of writing) and goes with its GitHub runner, expected around fall 2027. No musl: no request.

## Decisions

- _one fat npm package, not a per-platform matrix:_ npm's `os`/`cpu` selection works per package, so per-platform binaries mean one registry package each plus an installer that depends on them all. At ~2 MB gzipped per target the fat tarball is ~11 MB — a tenth of the peers that need the matrix. Reversible without a user-visible change: the launcher and bins stay, only where `native/` comes from moves.
- _no postinstall download:_ npm 12 and pnpm 10 block dependency lifecycle scripts by default; the install would silently produce a launcher with nothing to launch.
- _hand-rolled, not cargo-dist:_ its npm installer is the postinstall shape above, its npm publish is token-only, it owns the release workflow, and the project has one maintainer.
- _launcher, not symlinked binaries:_ npm `bin` entries must be files inside the package; a JS stub per bin is the portable form. The launcher spawns exactly the bundled binary and forwards argv, stdio, environment, exit status and signals — nothing else; `scripts/npm-check` holds it to that.
- _both packages own the `zshref-mcp` command:_ a global install of both collides; the READMEs say install one.
- _Homebrew:_ untouched — `EXTRACTION.md`.

## npm registry setup (one-time)

- npm Trusted Publishing needs an existing package: a package's first version is published by hand (`npm publish --access public --tag next`, OTP) from `npm/assemble.mjs` output — over the archives of a dry-run workflow run (`gh run download`), so the first publish carries every platform
- then, per package, a trusted publisher naming this repo and `release-zshref.yml`; configs created after 2026-09 default to stage-only — opt into direct publish
- `@carlwr/zshref-mcp` exists from the earlier TS alpha: no manual publish, the old publisher grant is re-pointed; a version number the TS alpha used is burned — the crate version must be past it
- the workflow skips a version already on the registry, so the tag that follows a manual publish completes the pair
- prerelease dist-tags: `PACKAGING.md` (`latest` moves by hand)

## Rehearsal

```sh
make cli-npm-check     # host: archive, stage, pack, offline install, launcher == native
make cli-release-act   # act: every job on the aarch64 Linux row, both publishes --dry-run
```

`make cli-release-act` maps `ubuntu-24.04-arm` onto act's Ubuntu image; on Apple Silicon that is the one row act can build natively. Only a real tag exercises:

- the macOS and Windows rows (Rosetta on the runner, `7z`)
- OIDC: npm provenance, crates.io token exchange
- the release itself: attestation, `gh release`

## After a release

```sh
npm view @carlwr/zshref dist-tags; npm view @carlwr/zshref-mcp dist-tags   # `latest` moved? (PACKAGING.md)
npx -y @carlwr/zshref-mcp@<version> --version                              # the npm path, end to end
cargo binstall -y --install-path /tmp/zshref zshref@<version>              # the archive path (brew install cargo-binstall)
gh release download zshref-v<version> -p SHA256SUMS -p 'zshref-aarch64-apple-darwin.tar.gz' -D /tmp/rel
gh attestation verify /tmp/rel/zshref-aarch64-apple-darwin.tar.gz --repo carlwr/better-zsh
```

Unpinned `cargo binstall zshref` and `cargo install zshref` fail while every version is a prerelease (`*` matches none); the README pins.
