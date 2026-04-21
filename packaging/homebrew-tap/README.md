# homebrew-zshref (pre-extraction scaffold)

Pre-release scaffold. Does not install anything real yet.

This directory (`packaging/homebrew-tap/`) is the **future content of a separate
`homebrew-zshref` repo**. It lives inside the `carlwr/better-zsh` monorepo for
ease of iteration before extraction.

## Extraction plan

When the Rust crate is extracted (see `zshref-rs/` and the pattern in
`packages/zshref-mcp/EXTRACTION.md`), copy this whole directory tree to a new
repo — likely `github.com/carlwr/homebrew-zshref` — as the full repo root.
The tap name maps directly: a repo named `homebrew-zshref` is addressable as:

```
brew tap carlwr/zshref
brew install zshref
```

## Pre-release status

No released tarballs and no crates.io publish exist yet. The formula cannot
install anything real until one of the following is true:

### Path A — build from source (cargo, active path in formula)
Requires a source tarball that bundles the TS-generated JSONs
(`packages/zsh-core/dist/json/*.json`, `packages/zsh-core-tooldef/dist/json/tooldef.json`).
Those JSONs are embedded via `include_bytes!` at compile time, so the tarball
must be built from a state where `pnpm install && pnpm build` has already run in
the monorepo (or the future standalone repo ships pre-generated JSONs).

When the source tarball is published as a GitHub Release asset, update:
- `url` in `Formula/zshref.rb` to point at the tarball URL
- `sha256` to the tarball's SHA-256

Then `brew install carlwr/zshref/zshref` will build from source using the
user's local Rust toolchain.

### Path B — binary tarball (post-release, commented out in formula)
Build and upload a pre-compiled macOS binary tarball to the GitHub Release.
Then swap in the Path B block in `Formula/zshref.rb` (already stubbed with
a `# TODO` comment), replacing the cargo source-install block.

Users run:

```
brew tap carlwr/zshref
brew install zshref
# or without tapping first:
brew install carlwr/zshref/zshref
```

## Files

| Path | Purpose |
|------|---------|
| `Formula/zshref.rb` | Homebrew formula — Path A (cargo source) active; Path B (binary tarball) stubbed |
| `.github/workflows/brew-audit.yml` | CI: `brew style` (always) + `brew audit --strict --online` (continue-on-error pre-release) |
| `.gitignore` | Standard Homebrew tap ignores |
