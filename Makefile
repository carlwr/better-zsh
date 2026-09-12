# docs: zshref-rs/DEVELOPMENT.md

mono     = cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo
vendored = cd zshref-rs && ZSHREF_DATA_SOURCE=vendored

.PHONY: artifacts
artifacts:
	pnpm bootstrap:upstream

.PHONY: cli
cli: artifacts
	$(mono) cargo build --release

.PHONY: cli-nlp
cli-nlp: artifacts
	$(mono) cargo build --release --features nlp

.PHONY: cli-debug
cli-debug: artifacts
	$(mono) cargo build

# second leg scoped to the nlp-gated targets; bare --features nlp adds cost, not coverage
.PHONY: cli-test
cli-test: artifacts
	$(mono) cargo test
	$(mono) cargo test --features nlp --bin zshref --test feature_flag --test nlp_search

.PHONY: cli-clean
cli-clean:
	cd zshref-rs && cargo clean

.PHONY: cli-tune-dashboard
cli-tune-dashboard: artifacts
	$(mono) BZ_TUNE_DASHBOARD=1 cargo test --release --features nlp --bin zshref tune_dashboard -- --nocapture

.PHONY: cli-tune-sweep
cli-tune-sweep: artifacts
	$(mono) BZ_TUNE_SWEEP=1 cargo test --release --features nlp --bin zshref tune_sweep -- --nocapture

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
	cp packages/zsh-core-tooldef/artifacts/json/tooldef.json zshref-rs/data/

.PHONY: vendor-clean
vendor-clean:
	rm -rf zshref-rs/data

.PHONY: cli-vendored
cli-vendored: vendor
	$(vendored) cargo build --release

.PHONY: cli-vendored-test
cli-vendored-test: vendor
	$(vendored) cargo test

# --all-features: catches `include` omissions behind feature gates
.PHONY: cli-package
cli-package: vendor
	$(vendored) cargo package --allow-dirty --all-features

.PHONY: nlp-model
nlp-model:
	packages/zshref-web/scripts/fetch-model

.PHONY: artifacts-web
artifacts-web:
	packages/zshref-web/scripts/fetch-artifacts
