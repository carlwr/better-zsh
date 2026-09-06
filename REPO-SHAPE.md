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
│   ├── zsh-core-tooldef       (TS lib; shared tool defs)
│   ├── zshref-mcp             (MCP server)
│   └── vscode-better-zsh      (VS Code extension)
├── zshref-rs/                 (Rust CLI; not a pnpm member)
└── zshref-web/                (TS SPA; not a pnpm member)
```

## Post-extraction

Producer-consumer arrows; pull-only, pinned by version:

- `zsh-core` → `zshref`, `zshref-mcp`, `vscode-better-zsh` (corpus + types)
- `zshref` → `zshref-web` (release JSON artifacts)
- HuggingFace Hub → `zshref-web` at runtime (BGE-small model assets)

`zshref-web` deliberately does not depend on `zsh-core`: everything the SPA renders already lives inside the index. Before introducing a `zsh-core` arrow, first try to route the data through `zshref`.

## Repo extraction destinations

- `zshref-rs/` → `zshref`
- `zshref-web/` → `zshref-web`
- `packages/zshref-mcp/` → `zshref-mcp` (see `packages/zshref-mcp/EXTRACTION.md`)
- everything else stays in `better-zsh`

## Detail scope

nlp and web specifics live under `zshref-rs/` and `zshref-web/`. Root maintainer docs point at them; they don't restate the detail. Anti-pattern: a root-level `EXTRACTION.md` accumulating nlp/web items that belong in the to-be-extracted dir's own checklist.

## Pointers

- `zshref-rs/AGENTS.md` — Rust CLI; NLP Cargo feature; two-binary release
- `zshref-rs/src/nlp/NLP.md` — NLP module measurements + packaging direction
- `zshref-web/AGENTS.md` — SPA dependency story, parity-test posture, data staging
- `zshref-rs/EXTRACTION.md`, `packages/zshref-mcp/EXTRACTION.md` — extraction-day checklists
