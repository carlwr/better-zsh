# Root Makefile — orchestrates TS artifact builds → cargo build for the
# Rust CLI (`zshref-rs/`). Everything else in the monorepo stays
# pnpm-driven; this Makefile is the only entry point that crosses the
# TS → Rust boundary.
#
# Goal: `make cli` produces a release binary with the corpus + tool-def
# JSON baked in via `include_bytes!`. If either artifact is missing or
# stale, the `artifacts` target rebuilds them first.

.PHONY: cli cli-debug cli-test cli-clean artifacts cli-fmt cli-fmt-check cli-clippy cli-check

artifacts:
	pnpm --filter @carlwr/zsh-core build
	pnpm --filter @carlwr/zsh-core-tooldef build

cli: artifacts
	cd zshref-rs && cargo build --release

cli-debug: artifacts
	cd zshref-rs && cargo build

cli-test: artifacts
	cd zshref-rs && cargo test

cli-clean:
	cd zshref-rs && cargo clean

cli-fmt:
	cd zshref-rs && cargo fmt

cli-fmt-check:
	cd zshref-rs && cargo fmt --check

cli-clippy: artifacts
	cd zshref-rs && cargo clippy --all-targets -- -D warnings

cli-check: cli-fmt-check cli-clippy
