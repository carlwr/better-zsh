# docs: zshref-rs/DEVELOPMENT.md
# cwd: the repo root — all paths are relative to it

SHELL          = bash
.SHELLFLAGS   += -eu -o pipefail  # ignored by old `make`-s; that's OK

crate-dir      = ./zshref-rs
mono           = cd $(crate-dir) && ZSHREF_DATA_SOURCE=monorepo
vendored       = cd $(crate-dir) && ZSHREF_DATA_SOURCE=vendored
host           = $(shell rustc -vV | sed -n 's/^host: //p')

.DEFAULT_GOAL  = artifacts

.PHONY:\
artifacts
artifacts:
	pnpm bootstrap:upstream

.PHONY:\
cli
cli: artifacts
	$(mono) cargo build --release

.PHONY:\
cli-debug
cli-debug: artifacts
	$(mono) cargo build

.PHONY:\
cli-test
cli-test: artifacts
	$(mono) cargo test --all-features

.PHONY:\
cli-fmt
cli-fmt:
	cd $(crate-dir) && cargo fmt

.PHONY:\
cli-check
cli-check: artifacts
	cd $(crate-dir) && cargo fmt --check
	$(mono) cargo clippy --all-targets --all-features -- -D warnings

.PHONY:\
vendor
vendor: artifacts vendor-clean
	@mkdir -p $(crate-dir)/data
	cp \
	  ./packages/zsh-core/artifacts/json/*.json \
	  ./packages/zsh-core/artifacts/resolver-fixture/resolver-fixture.json \
	  $(crate-dir)/data/

.PHONY:\
vendor-clean
vendor-clean:
	rm -rf $(crate-dir)/data

.PHONY:\
cli-vendored-test
cli-vendored-test: vendor
	$(vendored) cargo test --all-features

.PHONY:\
cli-package
cli-package: vendor
	$(vendored) cargo package --allow-dirty --all-features

.PHONY:\
cli-npm-check
cli-npm-check: artifacts
	$(mono) cargo build --release --features mcp --target $(host)
	$(crate-dir)/scripts/npm-check

# The release workflow under act, dry-run, on the one row act can build here
# (Apple Silicon runs arm64 containers): every job through both --dry-run
# publishes. Docs: zshref-rs/DISTRIBUTION.md.
.PHONY:\
cli-release-act
cli-release-act:
	ACT_WORKFLOW=release-zshref.yml \
	ACT_JOB=publish-crate \
	ACT_EVENT=workflow_dispatch \
	./scripts/test-integration-act \
	  --input dry_run=true \
	  --matrix target:aarch64-unknown-linux-gnu \
	  --platform ubuntu-24.04-arm=catthehacker/ubuntu:act-latest \
	  --artifact-server-path .aux/act-artifacts
