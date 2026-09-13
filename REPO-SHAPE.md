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
│   ├── zsh-core             TS lib: corpus, resolvers, rendering; emits the release assets
│   ├── vscode-better-zsh    VS Code extension
│   └── zshref-web           SPA; all NLP; index built at build time
└── zshref-rs/               Rust crate: `zshref` CLI + `zshref-mcp` bins; not a pnpm member
```

The product is named `zshref`; `zshref-rs/` is its directory here.

## Dependencies

An arrow reads "consumes, pinned by version"; its label is the mechanism:

```
                          zsh-core
            ┌────────────────┼──────────────────────┐
     workspace link    workspace link          release assets
      (built dist/)     (built dist/)     (corpus JSON, resolver fixture)
            ▼                ▼                      ▼
    vscode-better-zsh    zshref-web              zshref-rs
                             ▼
                       HuggingFace Hub
                     (model, at runtime)
```

- workspace link: pnpm `workspace:*` onto the upstream's built `dist/`; freshness: `scripts/build/README.md`
- release assets: tarballs on zsh-core's release tag, vendored by `make vendor` — `zshref-rs/DATA-SYNC.md`
- `zshref-web` consumes `zsh-core` at build time only — the index build; the browser bundle is `zsh-core`-free (`packages/zshref-web/AGENTS.md`)
- zsh-core is the only producer; the three consumers are leaves with no consumer of their own

Invariants — what the shape was chosen for, and the constraint on any change to it (principles: `PRINCIPLES.md` §"Cross-project structure"):

- one root of truth; every edge a pinned version of a standard mechanism
- leaves have no consumers: no freshness oracles, no fingerprints
- one behaviour mirror — the resolvers — owned by `zshref-rs`, checked against a fixture co-released with the corpus
- one language crossing, one direction — TS → Rust — carried by data; the mirror above is its only behaviour component

The shape before the 2026 reorg, and why it changed: the tag `pre-reorg` (its `.reorg-work/`).

## Extraction

One planned: `zshref-rs/` → its own repo, `zshref`. Checklist: `zshref-rs/EXTRACTION.md`; vendoring mechanics: `zshref-rs/DATA-SYNC.md`. Everything else stays; this repo keeps the name `better-zsh`.

## Detail scope

Web and NLP specifics live under `packages/zshref-web/`; Rust crate specifics under `zshref-rs/`. Root maintainer docs point at them; they don't restate the detail. Anti-pattern: a root-level `EXTRACTION.md` accumulating items that belong in `zshref-rs/`'s own checklist.

## Pointers

- `zshref-rs/AGENTS.md` — Rust crate
- `packages/zshref-web/AGENTS.md` — SPA: stack, upstreams, build, tests, hosting intent
- `packages/zshref-web/nlp/NLP.md` — the NLP module; holdout rules
