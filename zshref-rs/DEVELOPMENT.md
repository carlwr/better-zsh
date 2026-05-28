<!-- Not maintained during pre-release dev; re-derive at release time. -->

# Development — zshref

## Note: pre-release, monorepo

This document describes dev workflows during the monorepo phase. Post-extraction, rebuild/test commands change (the `pnpm --filter` steps are replaced by the cross-repo data-sync mechanism) — see `EXTRACTION.md` for the transition plan.

---

Rust CLI that bundles two TS-generated artifacts via `include_bytes!`:

- **Corpus JSONs** — `packages/zsh-core/dist/json/*.json` (built by `pnpm --filter @carlwr/zsh-core build`)
- **Tool-def JSON** — `packages/zsh-core-tooldef/dist/json/tooldef.json` (built by `pnpm --filter @carlwr/zsh-core-tooldef build`)

Because data is embedded at compile time, rebuild after Rust or artifact changes.

The `build.rs` auto-detects two data sources (monorepo paths vs. vendored `data/`) — see `DATA-SYNC.md` for the design. Pre-extraction the monorepo path is what you'll hit during normal dev; vendored mode exists for `cargo publish` validation.

## Rebuild rules

| What changed | What to run |
|---|---|
| Pure Rust only | `cargo build` |
| Tool-def (flag name, description, input/output schema) | `make cli-debug` (runs TS build first) |
| Corpus (zsh-core docs/types) | `make cli-debug` (runs TS build first) |

`make cli-debug` depends on `make artifacts`, which runs the `pnpm --filter` steps for both TS packages. For vendored-mode dev (e.g. verifying what `cargo publish` will see), use `make cli-vendored` / `make cli-vendored-test` instead.

## Make targets (from repo root)

- `make artifacts` — rebuild TS JSON only
- `make cli-debug` — TS artifacts + `cargo build`
- `make cli` — TS artifacts + `cargo build --release`
- `make cli-test` — TS artifacts + `cargo test`
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
```

From repo root: `./zshref-rs/target/debug/zshref <args>`.

## Testing

```sh
cargo test          # Rust-only proptests + schema/help smoke
```

Cross-language parity (TS `tool.execute()` vs the Rust binary) lives in
`packages/zsh-core-tooldef/src/test/parity.test.ts`. Build the release binary first, then run vitest:

```sh
make cli
pnpm --filter @carlwr/zsh-core-tooldef test parity
# tune fast-check budget: BZ_PARITY_RUNS=2000 pnpm ... test parity
```

The suite compares the binary's embedded `buildInputHash` against current
Rust inputs + generated JSON artifacts. Missing/stale binaries skip with a
banner; set `BZ_REQUIRE_PARITY=1` to fail instead. No auto-build.

## Test/use zsh completions manually

Configure completions for the curren zsh interactive session:
```sh
source =(cd zshref-rs && cargo run --quiet -- completions zsh)
```
