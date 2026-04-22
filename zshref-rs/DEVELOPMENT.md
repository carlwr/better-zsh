# Development — zshref

## Note: pre-release, monorepo

This document describes dev workflows during the monorepo phase. Post-extraction, rebuild/test commands change (the `pnpm --filter` steps are replaced by the cross-repo data-sync mechanism) — see `EXTRACTION.md` for the transition plan.

---

Rust CLI that bundles two TS-generated artifacts via `include_bytes!`:

- **Corpus JSONs** — `packages/zsh-core/dist/json/*.json` (built by `pnpm --filter @carlwr/zsh-core build`)
- **Tool-def JSON** — `packages/zsh-core-tooldef/dist/json/tooldef.json` (built by `pnpm --filter @carlwr/zsh-core-tooldef build`)

Because data is embedded at compile time, a stale artifact means a stale binary. Know when to rebuild.

The `build.rs` auto-detects two data sources (monorepo paths vs. vendored `data/`) — see `DATA-SYNC.md` for the design. Pre-extraction the monorepo path is what you'll hit during normal dev; vendored mode exists for `cargo publish` validation.

## Rebuild rules

| What changed | What to run |
|---|---|
| Pure Rust only | `cargo build` |
| Tool-def (flag name, description, schema) | `make cli-debug` (runs TS build first) |
| Corpus (zsh-core docs/types) | `make cli-debug` (runs TS build first) |
| Test fixtures | regenerate (see Testing), then `cargo test` |

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

## Fast dev loop

From inside `zshref-rs/`:

```sh
cargo build && ./target/debug/zshref <args>
```

From repo root: `./zshref-rs/target/debug/zshref <args>`.

Optional alias: `alias zshref-dev=./zshref-rs/target/debug/zshref`

## Testing

```sh
cargo test          # fixture parity tests (spawns the built binary per fixture)
```

Fixtures live at `zshref-rs/tests/fixtures/<tool>/<case>.json`.

On a TS behavior change: regenerate fixtures, commit, re-run `cargo test`:

```sh
BZ_WRITE_RUST_FIXTURES=1 pnpm --filter @carlwr/zsh-core-tooldef test rust-fixtures
# review the diff before committing
```

## Debugging help output

`zshref --help` writes to stderr (CLI contract). Page it with:

```sh
zshref --help 2>&1 | less
```

## Formatting / lint

`cargo fmt`, `cargo clippy` — not yet enforced by CI but run them before PRs.

## src/ map

| File | Role |
|---|---|
| `main.rs` | entry point |
| `cli.rs` | clap `Command` builder driven by `tooldef.json`; dispatches built-in subcommands (`completions`, `info`) |
| `corpus.rs` | loads embedded corpus JSON; data paths gated by `cfg(data_source = …)` from `build.rs` |
| `fuzzy.rs` | ASCII subsequence scorer used by `search`'s bottom-tier ranking |
| `tools/mod.rs` | tools module surface + dispatch |
| `tools/classify.rs` | `classify` subcommand |
| `tools/search.rs` | `search` subcommand |
| `tools/describe.rs` | `describe` subcommand |
| `tools/lookup_option.rs` | `lookup_option` subcommand |
| `tools/info.rs` | `info` subcommand |
| `output.rs` | JSON-on-stdout / help-on-stderr routing; `NO_COLOR` + `CLICOLOR_FORCE` handling |
