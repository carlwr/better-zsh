# docs: zshref-rs/DEVELOPMENT.md

mono     = cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo
vendored = cd zshref-rs && ZSHREF_DATA_SOURCE=vendored

# The crate embeds zsh-core's and tooldef's artifacts; no workspace member
# depends on tooldef, so the plain bootstrap would stop at zsh-core.
.PHONY: artifacts
artifacts:
	pnpm bootstrap:upstream @carlwr/zsh-core-tooldef

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
	cd zshref-rs && cargo clean

.PHONY: cli-fmt
cli-fmt:
	cd zshref-rs && cargo fmt

.PHONY: cli-fmt-check
cli-fmt-check:
	cd zshref-rs && cargo fmt --check

.PHONY: cli-clippy
cli-clippy: artifacts
	$(mono) cargo clippy --all-targets --all-features -- -D warnings

.PHONY: cli-check
cli-check: cli-fmt-check cli-clippy

.PHONY: vendor
vendor: artifacts vendor-clean
	@mkdir -p zshref-rs/data
	cp packages/zsh-core/artifacts/json/*.json zshref-rs/data/
	cp packages/zsh-core/artifacts/resolver-fixture/resolver-fixture.json zshref-rs/data/
	cp packages/zsh-core-tooldef/artifacts/json/tooldef.json zshref-rs/data/

.PHONY: vendor-clean
vendor-clean:
	rm -rf zshref-rs/data

.PHONY: cli-vendored
cli-vendored: vendor
	$(vendored) cargo build --release

.PHONY: cli-vendored-test
cli-vendored-test: vendor
	$(vendored) cargo test --all-features

.PHONY: cli-package
cli-package: vendor
	$(vendored) cargo package --allow-dirty --all-features
