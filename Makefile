# for help and use, see zshref-rs/DEVELOPMENT.md

.PHONY: artifacts
artifacts:
	pnpm --filter @carlwr/zsh-core build
	pnpm --filter @carlwr/zsh-core-tooldef build

.PHONY: cli
cli: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo build --release

.PHONY: cli-nlp
cli-nlp: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo build --release --features nlp

.PHONY: cli-debug
cli-debug: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo build

.PHONY: cli-test
cli-test: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo test

.PHONY: cli-clean
cli-clean:
	cd zshref-rs && cargo clean

# Rank-time tuning dashboard (dev tool, not a CI gate). This release build runs
# the full tier: sentence train/holdout + sanity + bare contract + the
# mechanical sentence layer + churn vs the committed tuning. The tier follows
# the build profile (a debug build prints the fast subset, omitting the slow
# mechanical layer), so there is no separate opt-in. `BZ_TUNE_BASE="key=val,…"`
# scores a candidate point and fills the churn row; `ZSHREF_NLP_BIN=<release
# --features nlp binary>` adds the held-out QA harness. Needs `zshref-rs/data-nlp/`.
.PHONY: cli-tune-dashboard
cli-tune-dashboard: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo BZ_TUNE_DASHBOARD=1 \
		cargo test --release --features nlp --bin zshref tune_dashboard -- --nocapture

# Rank-time tuning sweep (dev tool, not a CI gate). Embeds queries once, then
# re-ranks every knob variant against the combined train/mechanical objective
# (no re-embed, no per-variant recompile). `BZ_TUNE_BASE="disc_len=3,cat=0.01"`
# sweeps around a composed point for greedy iteration. Needs `zshref-rs/data-nlp/`.
.PHONY: cli-tune-sweep
cli-tune-sweep: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo BZ_TUNE_SWEEP=1 \
		cargo test --release --features nlp --bin zshref tune_sweep -- --nocapture

.PHONY: cli-fmt
cli-fmt:
	cd zshref-rs && cargo fmt

.PHONY: cli-fmt-check
cli-fmt-check:
	cd zshref-rs && cargo fmt --check

.PHONY: cli-clippy
cli-clippy: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo clippy --all-targets -- -D warnings

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
	cd zshref-rs && ZSHREF_DATA_SOURCE=vendored cargo build --release

.PHONY: cli-vendored-test
cli-vendored-test: vendor
	cd zshref-rs && ZSHREF_DATA_SOURCE=vendored cargo test

# `--all-features`: cargo's verify step extracts the tarball and compiles it,
# so it is the check that the published crate is self-contained. Default
# features alone miss embedded assets reached only under a feature gate —
# how `src/nlp/rules/*.yaml` stayed absent from `include` undetected.
.PHONY: cli-package
cli-package: vendor
	cd zshref-rs && ZSHREF_DATA_SOURCE=vendored cargo package --allow-dirty --all-features

# Stage zshref outputs for the SPA. Requires `cli-nlp` + populated
# `zshref-rs/data-nlp/` (model + generated index); the script errors with
# a hint if either is missing.
.PHONY: artifacts-web
artifacts-web:
	zshref-web/scripts/fetch-artifacts
