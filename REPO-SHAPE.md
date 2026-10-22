---
audience: maintainer
read-when: orienting on repo layout and product dependency arrows
---

# Repo shape

Single source of truth for the layout and the product dependency arrow set.

## Layout

```
.
├── packages/
│   ├── zsh-lexicon          TS lib: lexicon, resolvers, rendering; emits the release assets
│   ├── vscode-better-zsh    VS Code extension
│   └── zshref-web           SPA; all NLP; index built at build time
└── zshref-rs/               Rust crate: `zshref` CLI + `zshref-mcp` bins; not a pnpm member
```

The crate ships as `zshref`; `zshref-rs/` is its directory here.

## Dependencies

An arrow reads "consumes, pinned by version"; its label is the mechanism:

```
                        zsh-lexicon
            ┌────────────────┼──────────────────────┐
     workspace link    workspace link          release assets
      (built dist/)     (built dist/)     (lexicon JSON, resolver fixture)
            ▼                ▼                      ▼
    vscode-better-zsh    zshref-web              zshref-rs
                      ┌──────┴──────┐
                      ▼             ▼
              HuggingFace Hub    jsDelivr
            (model, at runtime) (ORT .wasm, at runtime)
```

- workspace link: pnpm `workspace:*` onto the upstream's built `dist/`; freshness: `scripts/build/README.md`
- release assets: zsh-lexicon's release tarballs, packed and vendored by `make vendor` — `zshref-rs/DATA-SYNC.md`
- `zshref-web` consumes `zsh-lexicon` at build time only — the index build; the browser bundle is `zsh-lexicon`-free (`packages/zshref-web/AGENTS.md`)
- zsh-lexicon is the only producer; the in-repo consumers are leaves with no consumer of their own

Invariants — what the shape was chosen for, and the constraint on any change to it (principles: `PRINCIPLES.md` §"Cross-project structure"):

- one root of truth; every edge a pinned version of a standard mechanism
- leaves have no consumers: no freshness oracles, no fingerprints
- one behaviour mirror — the resolvers — owned by `zshref-rs`, checked against a fixture co-released with the lexicon
- one language crossing, one direction — TS → Rust — carried by data; the mirror above is its only behaviour component

The shape before the 2026 reorg, and why it changed: the tag `pre-reorg` (its `.reorg-work/`).

## Names

Settled public names — the binary, the pnpm package, or the repo if dedicated:

- this repo `zsh-lexicon`
- TS lib `@carlwr/zsh-lexicon`
  - alphas up to `0.1.0-alpha.2` published as `@carlwr/zsh-core`, tagged `zsh-core-v*`
- CLI `zshref`; MCP server `zshref-mcp`
- SPA `zshref-web`
- extension `better-zsh`, displayed "Better Zsh"
  - pnpm package name: the extension ID's, so stays `better-zsh`
  - a dedicated repo: likely `vscode-better-zsh`

## Extraction

One planned: `zshref-rs/` → its own repo, `zshref`. Checklist: `zshref-rs/EXTRACTION.md`. Further splits: open.

## Detail scope

A leaf's specifics live under its own directory. Root maintainer docs point at them; they don't restate the detail. Anti-pattern: a root-level `EXTRACTION.md` accumulating items that belong in `zshref-rs/`'s own checklist.
