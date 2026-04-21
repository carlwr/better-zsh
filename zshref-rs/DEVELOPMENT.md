# Development — zshref-rs

Rust CLI that bundles two TS-generated artifacts via `include_bytes!`:

- **Corpus JSONs** — `packages/zsh-core/dist/json/*.json` (built by `pnpm --filter @carlwr/zsh-core build`)
- **Tool-def JSON** — `packages/zsh-core-tooldef/dist/json/tooldef.json` (built by `pnpm --filter @carlwr/zsh-core-tooldef build`)

Because data is embedded at compile time, a stale artifact means a stale binary. Know when to rebuild.

## Rebuild rules

| What changed | What to run |
|---|---|
| Pure Rust only | `cargo build` (skip TS entirely) |
| Tool-def (flag name, description, schema) | `pnpm --filter @carlwr/zsh-core-tooldef build` then `cargo build` — or just `make cli-debug` |
| Corpus (zsh-core docs/types) | `pnpm --filter @carlwr/zsh-core build && pnpm --filter @carlwr/zsh-core-tooldef build` then `cargo build` — or just `make cli-debug` |
| Test fixtures | regenerate (see Testing), then `cargo test` |

## Make targets (from repo root)

- `make artifacts` — rebuild TS JSON only
- `make cli-debug` — TS artifacts + `cargo build`
- `make cli` — TS artifacts + `cargo build --release`
- `make cli-test` — TS artifacts + `cargo test`
- `make cli-clean` — `cargo clean`

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
| `cli.rs` | clap `Command` builder driven by `tooldef.json` |
| `corpus.rs` | loads embedded corpus JSON |
| `tools/classify.rs` | `classify` subcommand |
| `tools/search.rs` | `search` subcommand |
| `tools/describe.rs` | `describe` subcommand |
| `tools/lookup_option.rs` | `lookup-option` subcommand |
| `output.rs` | JSON-on-stdout / help-on-stderr routing |
