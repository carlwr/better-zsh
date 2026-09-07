# for help and use, see zshref-rs/DEVELOPMENT.md

# One readiness call, not two raw builds: the downstream package's prebuild
# hook rebuilds the upstream one, so the raw form built it twice per invocation.
.PHONY: artifacts
artifacts:
	pnpm bootstrap:upstream

.PHONY: cli
cli: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo build --release

.PHONY: cli-nlp
cli-nlp: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo build --release --features nlp

.PHONY: cli-debug
cli-debug: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo build

# Second leg gates the NLP drift guards. `nlp` is not a default feature, so
# the first leg never compiles the nlp module — leaving its regenerate-or-
# assert guards (schemas, categories, lookup map/contract, parity fixture)
# unreachable, and a corpus edit free to invalidate every committed artifact
# unnoticed. Scoped rather than a bare `--features nlp`: that re-runs the
# integration suites under a second feature config for no new coverage, at
# ~6x the cost. `--bin zshref` holds the nlp unit tests; `feature_flag` the
# nlp-side CLI surface assertions.
.PHONY: cli-test
cli-test: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo test
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo test --features nlp --bin zshref --test feature_flag

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

# `--all-features`: a lint inside a `#[cfg(feature = ...)]` block is invisible
# to a default-features run, so the `nlp` module would otherwise be ungated
# here and in CI. Warm cost over default features is ~0.2s.
.PHONY: cli-clippy
cli-clippy: artifacts
	cd zshref-rs && ZSHREF_DATA_SOURCE=monorepo cargo clippy --all-targets --all-features -- -D warnings

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

# Download the local NLP model (~127M) into `zshref-rs/data-nlp/model/`.
# Gitignored and not reproducible from the repo; the index and every
# asset-gated test derive from it.
.PHONY: nlp-model
nlp-model:
	zshref-rs/scripts/fetch-model

# Stage zshref outputs for the SPA. Requires `cli-nlp` + populated
# `zshref-rs/data-nlp/` (model + generated index); the script errors with
# a hint if either is missing.
.PHONY: artifacts-web
artifacts-web:
	zshref-web/scripts/fetch-artifacts

# zshref-web is deliberately outside the pnpm workspace, so no root pnpm
# script reaches it; this is the convenience entry point.
.PHONY: web-qa
web-qa:
	cd zshref-web && pnpm qa
