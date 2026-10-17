---
audience: maintainer
read-when: designing the crate's tools, adapters, schemas or CLI
---

# Design — `zshref`

Crate-owned rationale; corpus, resolvers and the TS↔Rust mirror: root `DESIGN.md`.

## Output schemas

- Each tool's `outputSchema` is generated beside its implementation (`src/tools/schema.rs`).
- `subKind` enums and the record total come from the loaded corpus; the feedback schema from `index.json`.
- Cross-cutting "co-released schema precision" rationale: root `PRINCIPLES.md`.
- Drift enforced at test time: every tool response the crate's test suite sees is validated against its schema (`tests/common/`).

Per MCP spec, tools register `outputSchema`; responses include `structuredContent` for schema-aware clients while legacy clients still get JSON in `content[0].text`.

## Adapters of the shared tool surface

Two adapters over the same `ToolSet`: the CLI and the MCP server.

Adapters walk the tool set (`src/tools.rs`) and dispatch through it; nothing else — one shared request path, `Tool::call`.

Structural lock on the tool layer (the spec for its own claim): **scope fence** — `tests/scope_fence.rs`.

Tools are intent-split — lookup with markdown body, fuzzy discovery, enumeration — and stay separate: "search with no query" would be a silent footgun. A uniform output envelope keeps adapters simple. Per-tool surface: `README.md`.

Rejected alternatives:

- mega-tool with a `kind` enum
- one tool per category

One crate with a lib target and two bins; rejected shapes:

- the MCP as its own crate or repo over a `zshref` lib: a public lib API to semver for one consumer; three version bumps per change
- a TS MCP fed by a Rust-emitted metadata artifact: two behaviour implementations, so an oracle is still needed
- prose and limits as committed YAML + JSON Schema: one consumer once the MCP is Rust; constants and strings in Rust are the source

## Fuzzy search rationale

`zsh_search` walks four tiers — exact → resolver → prefix → fuzzy.

- Earlier tiers score `1.0`; fuzzy is `< 1.0` — the tier is recoverable from the score (`src/tools/search.rs`).
- Id-only tools (`zsh_search`, `zsh_list`) omit rendered markdown; compose with `zsh_docs` for bodies.

Why fuzzy at all:

- Corpus spelling of identities can drift benignly — fuzzy decouples agent intent from exact strings.
- Option shapes vary (`no_errreturn` vs `NOERRRETURN`). Resolver handles the category-specific cases; fuzzy covers the rest.

---

## CLI as a consumer

External coverage:

- `README.md`
- `DATA-SYNC.md`
- `CLI-POLICY.md`

Rust, not a TS CLI: several TS CLI frameworks were tried and each fought `--help` quality (root `PRINCIPLES.md`); clap did not. A small, fast, self-contained binary is the product for a tool agents invoke hundreds of times per session; single-binary TS routes give large binaries and slow startup.

The tool set keeps the marginal cost of "another adapter" low — the CLI assembles its `clap::Command` by walking it (`src/cli.rs`), tool and field prose included.

Cross-adapter notes:

- **Corpus metadata** — `zshref info`; MCP `initialize` carries only the suite preamble (`instructions`) and the crate version.
- **`zshref schema`** — one bundle, no per-tool subcommand: that would fight clap conventions.
- **Maintenance posture**:
  - re-vendor cadence measured in years
  - no runtime plugins
