---
audience: maintainer
read-when: designing the crate's tools, adapters, schemas or CLI
---

# Design — `zshref`

Crate-owned rationale; corpus, resolvers and the TS↔Rust mirror: root `DESIGN.md`.

## Schemas

- Each tool's `inputSchema` and `outputSchema` are generated beside its implementation (`src/tools/schema.rs`).
- `subKind` enums and the record total come from the loaded corpus; the feedback schema from `index.json`.
- Cross-cutting "co-released schema precision" rationale: root `PRINCIPLES.md`.
- Drift guards, at test time:
  - `outputSchema` — integration tests validate CLI and MCP responses against it (`tests/common/`)
  - `inputSchema` — probed per field against the typed `Input` decode (`src/tools.rs` tests)

Per MCP spec, tools register `outputSchema`; responses carry `structuredContent` for schema-aware clients and JSON in `content[0].text` for legacy ones.

## Adapters of the shared tool surface

Two adapters over the same `ToolSet`: the CLI and the MCP server. Judge changes as for unknown further adapters.

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

## `zsh_docs` takes `key`, not `id`

`key` is resolver input — raw tokens and surface forms (`AUTO_CD`, `> word`) as well as ids.

Ids round-trip: a returned `id` fed back as `key` with its `category` returns that `id` (`tests/cli_invariants.rs`); unscoped, the resolver walk may decline it (history word designators, modifiers).

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

Rust, not a TS CLI: several TS CLI frameworks were tried and each fought `--help` quality; clap did not. A small, fast, self-contained binary is the product for a tool agents invoke hundreds of times per session; single-binary TS routes give large binaries and slow startup.

The tool set keeps the marginal cost of "another adapter" low — the CLI assembles its `clap::Command` by walking it (`src/cli.rs`), tool and field prose included.

Cross-adapter notes:

- **Corpus metadata** — `zshref info`; MCP `initialize` carries only the suite preamble (`instructions`) and the crate version.
- **`zshref schema`** — one bundle, no per-tool subcommand: that would fight clap conventions.
- **Output framing** — one JSON value per response (per request in `batch`), not one line per match:
  - `matchesTotal` and the shared `outputSchema` need the whole envelope
  - overrides `CLI-POLICY.md`'s line-per-record SHOULD
- **Maintenance posture**:
  - re-vendor cadence measured in years
  - no runtime plugins
