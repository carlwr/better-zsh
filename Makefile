.PHONY: artifacts
artifacts:
	pnpm --filter @carlwr/zsh-core build
	pnpm --filter @carlwr/zsh-core-tooldef build

.PHONY: cli
cli: artifacts
	cd zshref-rs && cargo build --release

.PHONY: cli-debug
cli-debug: artifacts
	cd zshref-rs && cargo build

.PHONY: cli-test
cli-test: artifacts
	cd zshref-rs && cargo test

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
	cd zshref-rs && cargo clippy --all-targets -- -D warnings

.PHONY: cli-check
cli-check: cli-fmt-check cli-clippy

.PHONY: vendor
vendor: artifacts vendor-clean
	@mkdir -p zshref-rs/data
	cp packages/zsh-core/dist/json/*.json zshref-rs/data/
	cp packages/zsh-core-tooldef/dist/json/tooldef.json zshref-rs/data/

.PHONY: vendor-clean
vendor-clean:
	rm -rf zshref-rs/data

.PHONY: cli-vendored
cli-vendored: vendor
	cd zshref-rs && cargo build --release

.PHONY: cli-vendored-test
cli-vendored-test: vendor
	cd zshref-rs && cargo test

.PHONY: cli-package
cli-package: vendor
	cd zshref-rs && cargo package --allow-dirty
