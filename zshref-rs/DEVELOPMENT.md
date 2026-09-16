<!-- Not maintained during pre-release dev; re-derive at release time. -->

# Development — zshref

## Note: pre-release, monorepo

Monorepo-phase workflows; what changes at extraction: `EXTRACTION.md`.

---

Rust crate — the `zshref` CLI and, behind the `mcp` feature, the `zshref-mcp` MCP server — embedding zsh-core's corpus JSONs at compile time: rebuild after Rust or artifact changes.

The `build.rs` auto-detects two data sources (monorepo paths vs. vendored `data/`) — see `DATA-SYNC.md` for the design. Pre-extraction the monorepo path is what you'll hit during normal dev; vendored mode exists for `cargo publish` validation.

## Rebuild rules

| What changed | What to run |
|---|---|
| Pure Rust only (tool prose and schemas included) | `cargo build` |
| Corpus (zsh-core docs/types) | `make cli-debug` |
| Resolver behaviour (zsh-core `resolver.ts`) | `make cli-test` |

Every target: the repo-root `Makefile`; CI's selection of them: `.github/workflows/ci-rust.yml`.

## Fast dev loop

From inside `zshref-rs/`:

```sh
cargo build && ./target/debug/zshref <args>
cargo build --features mcp && ./target/debug/zshref-mcp --help
```

From repo root: `./zshref-rs/target/debug/zshref <args>`.

## Testing

```sh
cargo test --all-features
```

Manual, outside CI: `scripts/probe-opencode` (`--help`).

## Test/use zsh completions manually

Configure completions for the current zsh interactive session:
```sh
source =(cd zshref-rs && cargo run --quiet -- completions zsh)
```
