# Root Makefile — orchestrates TS artifact builds → cargo build for the
# Rust CLI (`zshref-rs/`). Everything else in the monorepo stays
# pnpm-driven; this Makefile is the only entry point that crosses the
# TS → Rust boundary.
#
# Goal: `make cli` produces a release binary with the corpus + tool-def
# JSON baked in via `include_bytes!`. If either artifact is missing or
# stale, the `artifacts` target rebuilds them first.

.PHONY: cli cli-debug cli-test cli-clean artifacts

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
