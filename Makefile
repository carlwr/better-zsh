# docs: zshref-rs/DEVELOPMENT.md
# cwd: the repo root — every path below is relative to it

crate    = zshref-rs
mono     = cd $(crate) && ZSHREF_DATA_SOURCE=monorepo
vendored = cd $(crate) && ZSHREF_DATA_SOURCE=vendored
host     = $(shell rustc -vV | sed -n 's/^host: //p')

.PHONY: artifacts
artifacts:
	pnpm bootstrap:upstream

.PHONY: cli
cli: artifacts
	$(mono) cargo build --release

.PHONY: cli-debug
cli-debug: artifacts
	$(mono) cargo build

.PHONY: cli-test
cli-test: artifacts
	$(mono) cargo test --all-features

.PHONY: cli-clean
cli-clean:
	cd $(crate) && cargo clean

.PHONY: cli-fmt
cli-fmt:
	cd $(crate) && cargo fmt

.PHONY: cli-fmt-check
cli-fmt-check:
	cd $(crate) && cargo fmt --check

.PHONY: cli-clippy
cli-clippy: artifacts
	$(mono) cargo clippy --all-targets --all-features -- -D warnings

.PHONY: cli-check
cli-check: cli-fmt-check cli-clippy

.PHONY: vendor
vendor: artifacts vendor-clean
	@mkdir -p $(crate)/data
	cp packages/zsh-core/artifacts/json/*.json $(crate)/data/
	cp packages/zsh-core/artifacts/resolver-fixture/resolver-fixture.json $(crate)/data/

.PHONY: vendor-clean
vendor-clean:
	rm -rf $(crate)/data

.PHONY: cli-vendored
cli-vendored: vendor
	$(vendored) cargo build --release

.PHONY: cli-vendored-test
cli-vendored-test: vendor
	$(vendored) cargo test --all-features

.PHONY: cli-package
cli-package: vendor
	$(vendored) cargo package --allow-dirty --all-features

.PHONY: cli-npm-check
cli-npm-check: artifacts
	$(mono) cargo build --release --features mcp --target $(host)
	$(crate)/scripts/npm-check

# The release workflow under act, dry-run, on the one row act can build here
# (Apple Silicon runs arm64 containers): every job through both --dry-run
# publishes. Docs: zshref-rs/DISTRIBUTION.md.
.PHONY: cli-release-act
cli-release-act:
	ACT_WORKFLOW=release-zshref.yml \
	ACT_JOB=publish-crate \
	ACT_EVENT=workflow_dispatch \
	scripts/test-integration-act \
	  --input dry_run=true \
	  --matrix target:aarch64-unknown-linux-gnu \
	  --platform ubuntu-24.04-arm=catthehacker/ubuntu:act-latest \
	  --artifact-server-path .aux/act-artifacts
