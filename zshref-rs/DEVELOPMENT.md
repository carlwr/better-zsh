<!-- Not maintained during pre-release dev; re-derive at release time. -->

# Development — zshref

## Note: pre-release, monorepo

This document describes dev workflows during the monorepo phase. Post-extraction, rebuild/test commands change (the `pnpm --filter` steps are replaced by the cross-repo data-sync mechanism) — see `EXTRACTION.md` for the transition plan.

---

Rust crate — the `zshref` CLI and, behind the `mcp` feature, the `zshref-mcp` MCP server — bundling the TS-generated corpus JSONs (`packages/zsh-core/artifacts/json/*.json`, built by `pnpm --filter @carlwr/zsh-core build`) via `include_bytes!`.

A second artifact, the resolver conformance fixture (`packages/zsh-core/artifacts/resolver-fixture/`), is read by `cargo test` rather than embedded; it is vendored next to the corpus and ships in the `.crate` so the tests run from a downloaded crate.

Because data is embedded at compile time, rebuild after Rust or artifact changes.

The `build.rs` auto-detects two data sources (monorepo paths vs. vendored `data/`) — see `DATA-SYNC.md` for the design. Pre-extraction the monorepo path is what you'll hit during normal dev; vendored mode exists for `cargo publish` validation.

## Rebuild rules

| What changed | What to run |
|---|---|
| Pure Rust only (tool prose and schemas included) | `cargo build` |
| Corpus (zsh-core docs/types) | `make cli-debug` (runs TS build first) |
| Resolver behaviour (zsh-core `resolver.ts`) | `make cli-test` (refreshes the conformance fixture, then runs `cargo test`) |

`make cli-debug` depends on `make artifacts`, which builds zsh-core. For vendored-mode dev (e.g. verifying what `cargo publish` will see), use `make cli-vendored` / `make cli-vendored-test` instead.

## Make targets (from repo root)

- `make artifacts` — rebuild TS JSON only
- `make cli-debug` — TS artifacts + `cargo build`
- `make cli` — TS artifacts + `cargo build --release`
- `make cli-test` — TS artifacts + `cargo test --all-features`
- `make cli-clean` — `cargo clean`
- `make cli-fmt` / `cli-fmt-check` / `cli-clippy` / `cli-check` — formatting + lint
- `make vendor` / `vendor-clean` — populate / remove `zshref-rs/data/` from TS output (see `DATA-SYNC.md`)
- `make cli-vendored` / `cli-vendored-test` — build/test in vendored mode
- `make cli-package` — `cargo package --allow-dirty` (publishable-tarball smoke)

CI enforces `make cli-check`; run it before PRs.

## Fast dev loop

From inside `zshref-rs/`:

```sh
cargo build && ./target/debug/zshref <args>
cargo build --features mcp && ./target/debug/zshref-mcp --help
```

From repo root: `./zshref-rs/target/debug/zshref <args>`.

## Testing

```sh
cargo test --all-features   # proptests, schema/help smoke, resolver-fixture conformance, MCP stdio session
```

`scripts/probe-opencode` drives the built `zshref-mcp` through a real agent client (opencode); manual, not in CI.

## Test/use zsh completions manually

Configure completions for the current zsh interactive session:
```sh
source =(cd zshref-rs && cargo run --quiet -- completions zsh)
```
