# Development — zshref

Monorepo-phase workflows; what changes at extraction: `EXTRACTION.md`.

`zshref` and `zshref-mcp` embed zsh-lexicon's JSON artifacts at compile time: rebuild after Rust or artifact changes.

`build.rs` auto-detects the data source: the monorepo's zsh-lexicon artifacts when present (normal dev), else `data/` — vendored from zsh-lexicon's release tarballs; what the published `.crate` ships. Design: `DATA-SYNC.md`.

## Rebuild rules

| What changed | What to run |
|---|---|
| Pure Rust only (tool prose and schemas included) | `cargo build` |
| Lexicon (zsh-lexicon docs/types) | `make cli-debug` |
| Resolver behaviour (zsh-lexicon `resolver.ts`) | `make cli-test` |

Every target: the repo-root `Makefile`; CI's selection of them: `.github/workflows/ci-rust.yml`.

## Fast dev loop

From inside `zshref-rs/`:

```sh
cargo build && ./target/debug/zshref <args>
cargo build --features mcp && ./target/debug/zshref-mcp --help
```

## Testing

```sh
cargo test --all-features
```

Manual, outside CI: `scripts/probe-opencode` (`--help`).

## zsh completions from source

From the repo root, for the current interactive session:

```sh
source =(cd zshref-rs && cargo run --quiet -- completions zsh)
```
