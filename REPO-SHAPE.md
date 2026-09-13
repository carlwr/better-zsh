---
audience: maintainer
read-when: orienting on monorepo layout vs post-release repo set and product dependency arrows
---

# Repo shape

Single source of truth for the product dependency arrow set; both timelines.

## Current (monorepo)

```
.
├── packages/
│   ├── zsh-core               (TS lib; corpus + types)
│   ├── vscode-better-zsh      (VS Code extension)
│   └── zshref-web             (TS SPA)
└── zshref-rs/                 (Rust crate: `zshref` CLI + `zshref-mcp` MCP server; not a pnpm member)
```

## Repo extraction destinations

Left of the arrow is today's monorepo path; right is the eventual repo name. The product is named `zshref`; `zshref-rs/` is only the current directory.

- `zshref-rs/` → `zshref` (see `zshref-rs/EXTRACTION.md`)
- everything else stays put; this repo keeps the name `better-zsh`

## Post-extraction

Producer-consumer arrows; pull-only, pinned by version:

- `zsh-core` → `zshref` (corpus JSON + resolver fixture), `vscode-better-zsh`, `zshref-web` (corpus + types)
- HuggingFace Hub → `zshref-web` (the embedding model: fetched at runtime by the browser, pre-fetched for the Node side)

`zshref-web` consumes `zsh-core` at build time only — the index build; the browser bundle is `zsh-core`-free (`packages/zshref-web/AGENTS.md`). `zshref` produces nothing for `zshref-web`.

## Detail scope

Web and NLP specifics live under `packages/zshref-web/`; Rust crate specifics under `zshref-rs/`. Root maintainer docs point at them; they don't restate the detail. Anti-pattern: a root-level `EXTRACTION.md` accumulating items that belong in the to-be-extracted dir's own checklist.

## Pointers

- `zshref-rs/AGENTS.md` — Rust crate
- `packages/zshref-web/AGENTS.md` — SPA: stack, upstreams, build, tests, hosting intent
- `packages/zshref-web/nlp/NLP.md` — the NLP module; holdout rules
- `zshref-rs/EXTRACTION.md` — extraction-day checklist
